#!/usr/bin/env node
/**
 * Configure Super Admin User
 *
 * Interactive during seeding:
 * - prompts for super admin account details
 * - creates or updates the admin account
 * - assigns selected agency
 *
 * Non-interactive fallback:
 * - reads values from env vars
 */

require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { sql, connectToDatabase, closeConnection } = require('../src/config/database');

const DEFAULTS = {
  username: process.env.SEED_ADMIN_USERNAME || 'admin',
  employeeName: process.env.SEED_ADMIN_NAME || 'System Administrator',
  employeeContact: process.env.SEED_ADMIN_PHONE || '',
  email: process.env.SEED_ADMIN_EMAIL || 'admin@herzog.com',
  password: process.env.SEED_ADMIN_PASSWORD || '',
};

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function shouldUseInteractive() {
  const noPrompt = String(process.env.SEED_NO_PROMPT || '').toLowerCase() === 'true';
  if (noPrompt) return false;
  if (getArg('no-prompt') === 'true') return false;
  return process.stdin.isTTY && process.stdout.isTTY;
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (label, fallback = '') =>
    new Promise((resolve) => {
      const hint = fallback ? ` [${fallback}]` : '';
      rl.question(`${label}${hint}: `, (value) => {
        const trimmed = String(value || '').trim();
        resolve(trimmed || fallback);
      });
    });

  const close = () => rl.close();
  return { ask, close };
}

async function getAgencies(pool) {
  const result = await pool.request().query(`
    SELECT Agency_ID, Agency_CD, Agency_Name
    FROM Agencies
    WHERE Is_Active = 1
    ORDER BY Agency_Name
  `);
  return result.recordset || [];
}

async function findAgencyWithMostTracks(pool) {
  const result = await pool.request().query(`
    SELECT TOP 1
      s.Agency_ID,
      COUNT(DISTINCT t.Track_ID) AS TrackCount
    FROM Subdivisions s
    LEFT JOIN Tracks t ON s.Subdivision_ID = t.Subdivision_ID
    GROUP BY s.Agency_ID
    ORDER BY TrackCount DESC
  `);
  return result.recordset[0] || null;
}

async function gatherAdminInput(pool) {
  const agencies = await getAgencies(pool);
  if (!agencies.length) {
    throw new Error('No active agencies found. Seed agencies first.');
  }

  const defaultAgencyHint = await findAgencyWithMostTracks(pool);
  const defaultAgencyId = Number(
    process.env.SEED_ADMIN_AGENCY_ID ||
      getArg('agency-id') ||
      defaultAgencyHint?.Agency_ID ||
      agencies[0].Agency_ID
  );

  const base = {
    username: getArg('username') || DEFAULTS.username,
    employeeName: getArg('name') || DEFAULTS.employeeName,
    employeeContact: getArg('phone') || DEFAULTS.employeeContact,
    email: getArg('email') || DEFAULTS.email,
    password: getArg('password') || DEFAULTS.password,
    agencyId: defaultAgencyId,
  };

  if (!shouldUseInteractive()) {
    if (!base.password) {
      throw new Error('SEED_ADMIN_PASSWORD (or --password) is required when prompt is disabled.');
    }
    return base;
  }

  console.log('\nSuper Admin Setup');
  console.log('Use Enter to keep suggested defaults.\n');
  console.log('Available agencies:');
  agencies.forEach((a) => {
    console.log(`  - ${a.Agency_ID}: ${a.Agency_Name} (${a.Agency_CD})`);
  });
  console.log('');

  const prompt = createPrompt();
  try {
    const username = await prompt.ask('Username', base.username);
    const employeeName = await prompt.ask('Full name', base.employeeName);
    const employeeContact = await prompt.ask('Phone', base.employeeContact);
    const email = await prompt.ask('Email', base.email);
    const agencyIdRaw = await prompt.ask('Agency ID', String(base.agencyId));
    const password = await prompt.ask(
      'Password',
      base.password || 'ChangeMe123!'
    );

    const agencyId = Number(agencyIdRaw);
    if (!Number.isFinite(agencyId)) {
      throw new Error('Agency ID must be numeric.');
    }

    return {
      username,
      employeeName,
      employeeContact,
      email,
      password,
      agencyId,
    };
  } finally {
    prompt.close();
  }
}

async function validateAgency(pool, agencyId) {
  const result = await pool.request()
    .input('agencyId', sql.Int, agencyId)
    .query(`
      SELECT TOP 1 Agency_ID, Agency_Name, Agency_CD
      FROM Agencies
      WHERE Agency_ID = @agencyId
        AND Is_Active = 1
    `);

  return result.recordset[0] || null;
}

async function upsertSuperAdmin(pool, input) {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const existing = await pool.request()
    .input('username', sql.VarChar(50), input.username)
    .query(`
      SELECT TOP 1 User_ID
      FROM Users
      WHERE Username = @username
    `);

  if (existing.recordset.length) {
    const userId = existing.recordset[0].User_ID;
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('agencyId', sql.Int, input.agencyId)
      .input('passwordHash', sql.VarChar(sql.MAX), passwordHash)
      .input('employeeName', sql.VarChar(100), input.employeeName)
      .input('employeeContact', sql.VarChar(20), input.employeeContact || null)
      .input('email', sql.VarChar(100), input.email || null)
      .query(`
        UPDATE Users
        SET Agency_ID = @agencyId,
            Password_Hash = @passwordHash,
            Employee_Name = @employeeName,
            Employee_Contact = @employeeContact,
            Email = @email,
            Role = 'Administrator',
            Is_Active = 1,
            Modified_Date = GETDATE()
        WHERE User_ID = @userId
      `);

    return { mode: 'updated', userId };
  }

  const inserted = await pool.request()
    .input('agencyId', sql.Int, input.agencyId)
    .input('username', sql.VarChar(50), input.username)
    .input('passwordHash', sql.VarChar(sql.MAX), passwordHash)
    .input('employeeName', sql.VarChar(100), input.employeeName)
    .input('employeeContact', sql.VarChar(20), input.employeeContact || null)
    .input('email', sql.VarChar(100), input.email || null)
    .query(`
      INSERT INTO Users (
        Agency_ID,
        Username,
        Password_Hash,
        Employee_Name,
        Employee_Contact,
        Email,
        Role,
        Is_Active
      )
      OUTPUT INSERTED.User_ID
      VALUES (
        @agencyId,
        @username,
        @passwordHash,
        @employeeName,
        @employeeContact,
        @email,
        'Administrator',
        1
      )
    `);

  return { mode: 'created', userId: inserted.recordset[0].User_ID };
}

async function configureAdminUser() {
  try {
    console.log('Configuring super admin user...');

    const pool = await connectToDatabase();
    if (!pool) {
      throw new Error('Failed to connect to database');
    }

    const adminInput = await gatherAdminInput(pool);
    const agency = await validateAgency(pool, adminInput.agencyId);
    if (!agency) {
      throw new Error(`Agency ${adminInput.agencyId} not found or inactive.`);
    }

    const result = await upsertSuperAdmin(pool, adminInput);

    console.log('\nSuper admin configured successfully:');
    console.log(`  User: ${adminInput.username}`);
    console.log(`  Name: ${adminInput.employeeName}`);
    console.log(`  Agency: ${agency.Agency_Name} (${agency.Agency_CD})`);
    console.log(`  Mode: ${result.mode}`);
    console.log(`  User_ID: ${result.userId}`);

    console.log('\nImportant: ensure this user is marked as super admin using one of:');
    console.log('  - username "admin" / User_ID 1 (default fallback), or');
    console.log('  - .env: SUPER_ADMIN_USERNAMES / SUPER_ADMIN_EMAILS / SUPER_ADMIN_USER_IDS');
  } catch (error) {
    console.error('Super admin configuration failed:', error.message);
    throw error;
  } finally {
    await closeConnection();
  }
}

if (require.main === module) {
  configureAdminUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = configureAdminUser;

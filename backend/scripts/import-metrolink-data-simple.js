/**
 * Metro Link Data Import Script (single-connection, resilient parsing)
 *
 * Why this exists:
 * - The previous "simple" script only created agencies.
 * - This version imports full Track and Milepost data from Excel.
 *
 * Usage examples:
 *   node backend/scripts/import-metrolink-data-simple.js
 *   node backend/scripts/import-metrolink-data-simple.js --excel "swl/seeds/Metro Link map Data.xlsx"
 *   node backend/scripts/import-metrolink-data-simple.js --target-agency-id 1
 *   node backend/scripts/import-metrolink-data-simple.js --target-agency-code METRLK
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const ExcelJS = require('exceljs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const argv = process.argv.slice(2);

const getArgValue = (name) => {
  const direct = argv.find((entry) => entry.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return null;
};

const cliExcel = getArgValue('--excel');
const cliTargetAgencyId = getArgValue('--target-agency-id');
const cliTargetAgencyCode = getArgValue('--target-agency-code');

const envExcel = process.env.METROLINK_EXCEL_FILE || null;
const envTargetAgencyId = process.env.METROLINK_TARGET_AGENCY_ID || null;
const envTargetAgencyCode = process.env.METROLINK_TARGET_AGENCY_CODE || null;

const targetAgencyId = Number(cliTargetAgencyId || envTargetAgencyId || 0) || null;
const targetAgencyCode = (cliTargetAgencyCode || envTargetAgencyCode || '').trim() || null;

const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '1434', 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 60000,
    requestTimeout: 60000,
    appName: 'SidekickMetrolinkImportSimple',
  },
};

const TRANSIENT_DB_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_DB_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
};

const normalizeCellValue = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  if (raw instanceof Date) return raw.toISOString();

  if (typeof raw === 'object') {
    if (raw.result !== undefined) return normalizeCellValue(raw.result);
    if (raw.text !== undefined) return normalizeCellValue(raw.text);
    if (Array.isArray(raw.richText)) {
      return raw.richText.map((part) => part?.text || '').join('');
    }
    if (raw.hyperlink && raw.text) return raw.text;
  }

  return String(raw);
};

const asString = (raw) => {
  const value = normalizeCellValue(raw);
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const asNumber = (raw) => {
  const value = normalizeCellValue(raw);
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseTrackType = (raw) => {
  const value = asString(raw);
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'MAIN' || upper === 'MN') return 'Main';
  if (upper === 'YD' || upper === 'YARD') return 'Yard';
  if (upper === 'SD' || upper === 'SIDING') return 'Siding';
  if (upper === 'ST' || upper === 'STORAGE') return 'Storage';
  if (upper === 'XOVER' || upper === 'X-OVER' || upper === 'X_OVER' || upper === 'CROSSOVER') return 'X_Over';
  return 'Other';
};

const parseAssetType = (raw) => {
  const value = asString(raw);
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'SWITCH') return 'Switch';
  if (upper === 'SIGNAL') return 'Signal';
  if (upper === 'CROSSING' || upper === 'ROAD CROSSING' || upper === 'RAIL CROSSING') return 'Crossing';
  return 'Other';
};

const parseAssetStatus = (raw) => {
  const value = asString(raw);
  if (!value) return null;
  const upper = value.toUpperCase();
  if (['ACTIVE', 'INACTIVE', 'PLANNED', 'REMOVED'].includes(upper)) return upper;
  return null;
};

const createSubdivisionCode = (name) => {
  const stripped = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (stripped || 'SUB').slice(0, 20);
};

const resolveExcelFile = () => {
  const candidates = [];

  if (cliExcel) candidates.push(cliExcel);
  if (envExcel) candidates.push(envExcel);

  candidates.push(path.join(__dirname, '../sql/seeds/Metro Link map Data.xlsx'));
  candidates.push(path.join(__dirname, '../sql/seeds/Metro Link Map Data.xlsx'));
  candidates.push(path.join(__dirname, '../../swl/seeds/Metro Link map Data.xlsx'));
  candidates.push(path.join(__dirname, '../../swl/seeds/Metro Link Map Data.xlsx'));

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  throw new Error(
    `Excel file not found. Checked: ${candidates.join(' | ')}. ` +
    'Pass --excel "<path>" or set METROLINK_EXCEL_FILE.'
  );
};

const queryWithRetry = async (pool, requestFactory, query, context, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const request = requestFactory(pool.request());
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      const delay = 500 * (2 ** (attempt - 1));
      console.warn(`Retrying ${context} (${attempt}/${maxRetries}) in ${delay}ms: ${error.message}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
};

const getOrCreateAgencyByCode = async (pool, agencyCode, agencyName = null) => {
  const result = await queryWithRetry(
    pool,
    (request) => request
      .input('agency_cd', sql.NVarChar(50), agencyCode)
      .input('agency_name', sql.NVarChar(100), agencyName || agencyCode),
    `
      IF NOT EXISTS (SELECT 1 FROM Agencies WHERE Agency_CD = @agency_cd)
      BEGIN
        INSERT INTO Agencies (Agency_CD, Agency_Name)
        VALUES (@agency_cd, @agency_name);
      END

      SELECT Agency_ID FROM Agencies WHERE Agency_CD = @agency_cd;
    `,
    `getOrCreateAgencyByCode.${agencyCode}`
  );
  return result.recordset[0]?.Agency_ID || null;
};

const getAgencyById = async (pool, agencyId) => {
  const result = await queryWithRetry(
    pool,
    (request) => request.input('agency_id', sql.Int, agencyId),
    'SELECT Agency_ID, Agency_CD, Agency_Name FROM Agencies WHERE Agency_ID = @agency_id',
    `getAgencyById.${agencyId}`
  );
  return result.recordset[0] || null;
};

const getOrCreateSubdivision = async (pool, agencyId, subdivisionName) => {
  const subdivisionCode = createSubdivisionCode(subdivisionName);
  const result = await queryWithRetry(
    pool,
    (request) => request
      .input('agency_id', sql.Int, agencyId)
      .input('sub_code', sql.NVarChar(50), subdivisionCode)
      .input('sub_name', sql.NVarChar(100), `${subdivisionName} Subdivision`),
    `
      IF NOT EXISTS (
        SELECT 1 FROM Subdivisions
        WHERE Agency_ID = @agency_id
          AND Subdivision_Code = @sub_code
      )
      BEGIN
        INSERT INTO Subdivisions (Agency_ID, Subdivision_Code, Subdivision_Name, Region)
        VALUES (@agency_id, @sub_code, @sub_name, 'Imported');
      END

      SELECT Subdivision_ID
      FROM Subdivisions
      WHERE Agency_ID = @agency_id
        AND Subdivision_Code = @sub_code;
    `,
    `getOrCreateSubdivision.${agencyId}.${subdivisionCode}`
  );
  return result.recordset[0]?.Subdivision_ID || null;
};

const buildSheet1Rows = (worksheet) => {
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    const agencyCode = asString(values[1]);
    const subdivisionName = asString(values[2]);
    const lat = asNumber(values[22]);
    const lng = asNumber(values[23]);

    rows.push({
      agencyCode,
      subdivisionName,
      region: asString(values[3]),
      ls: asString(values[4]),
      trackType: asString(values[5]),
      trackNumber: asString(values[6]),
      divergingTrackType: asString(values[7]),
      divergingTrackNumber: asString(values[8]),
      facingDirection: asString(values[9]),
      mpSuffix: asString(values[10]),
      bmp: asNumber(values[11]),
      emp: asNumber(values[12]),
      assetName: asString(values[13]),
      assetType: asString(values[14]),
      assetSubType: asString(values[15]),
      assetId: asString(values[16]),
      dotNumber: asString(values[17]),
      legacyAssetNumber: asString(values[18]),
      assetDesc: asString(values[19]),
      assetStatus: asString(values[20]),
      latitude: lat,
      longitude: lng,
      department: asString(values[24]),
      notes: asString(values[25]),
    });
  });
  return rows;
};

const buildDirectMpRows = (worksheet) => {
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values;
    rows.push({
      subdivisionName: asString(values[1]),
      milepost: asNumber(values[2]),
      latitude: asNumber(values[3]),
      longitude: asNumber(values[4]),
      appleMapUrl: asString(values[5]),
      googleMapUrl: asString(values[6]),
    });
  });
  return rows;
};

const importTracks = async (pool, sheetRows, subdivisionMap) => {
  let imported = 0;
  let skipped = 0;

  for (const row of sheetRows) {
    if (!row.subdivisionName || row.latitude === null || row.longitude === null) {
      skipped += 1;
      continue;
    }

    const key = `${row.agencyCode || 'UNKNOWN'}::${row.subdivisionName}`;
    const subdivisionId = subdivisionMap.get(key) || subdivisionMap.get(`*::${row.subdivisionName}`);
    if (!subdivisionId) {
      skipped += 1;
      continue;
    }

    const normalizedTrackType = parseTrackType(row.trackType);
    const normalizedDivTrackType = parseTrackType(row.divergingTrackType);
    const normalizedAssetType = parseAssetType(row.assetType);
    const normalizedAssetStatus = parseAssetStatus(row.assetStatus);
    const resolvedSubType = row.assetSubType || (normalizedAssetType === 'Other' ? row.assetType : null);

    await queryWithRetry(
      pool,
      (request) => request
        .input('subdivision_id', sql.Int, subdivisionId)
        .input('ls', sql.VarChar(50), row.ls)
        .input('track_type', sql.VarChar(20), normalizedTrackType)
        .input('track_number', sql.VarChar(20), row.trackNumber)
        .input('div_track_type', sql.VarChar(20), normalizedDivTrackType)
        .input('div_track_number', sql.VarChar(20), row.divergingTrackNumber)
        .input('facing_direction', sql.VarChar(10), row.facingDirection)
        .input('mp_suffix', sql.VarChar(10), row.mpSuffix)
        .input('bmp', sql.Decimal(10, 4), row.bmp)
        .input('emp', sql.Decimal(10, 4), row.emp)
        .input('asset_name', sql.NVarChar(200), row.assetName)
        .input('asset_type', sql.VarChar(50), normalizedAssetType)
        .input('asset_subtype', sql.VarChar(50), resolvedSubType)
        .input('asset_id', sql.VarChar(100), row.assetId)
        .input('dot_number', sql.VarChar(50), row.dotNumber)
        .input('legacy_asset_number', sql.VarChar(50), row.legacyAssetNumber)
        .input('asset_desc', sql.NVarChar(500), row.assetDesc)
        .input('asset_status', sql.VarChar(20), normalizedAssetStatus)
        .input('latitude', sql.Decimal(10, 8), row.latitude)
        .input('longitude', sql.Decimal(11, 8), row.longitude)
        .input('department', sql.VarChar(50), row.department)
        .input('notes', sql.NVarChar(sql.MAX), row.notes),
      `
        IF NOT EXISTS (
          SELECT 1 FROM Tracks
          WHERE Subdivision_ID = @subdivision_id
            AND ISNULL(Asset_Name, '') = ISNULL(@asset_name, '')
            AND ISNULL(Asset_ID, '') = ISNULL(@asset_id, '')
            AND Latitude = @latitude
            AND Longitude = @longitude
        )
        BEGIN
          INSERT INTO Tracks (
            Subdivision_ID, LS, Track_Type, Track_Number,
            Diverging_Track_Type, Diverging_Track_Number, Facing_Direction, MP_Suffix,
            BMP, EMP, Asset_Name, Asset_Type, Asset_SubType, Asset_ID, DOT_Number,
            Legacy_Asset_Number, Asset_Desc, Asset_Status, Latitude, Longitude,
            Department, Notes
          )
          VALUES (
            @subdivision_id, @ls, @track_type, @track_number,
            @div_track_type, @div_track_number, @facing_direction, @mp_suffix,
            @bmp, @emp, @asset_name, @asset_type, @asset_subtype, @asset_id, @dot_number,
            @legacy_asset_number, @asset_desc, @asset_status, @latitude, @longitude,
            @department, @notes
          );
        END
      `,
      `importTracks.${subdivisionId}.${row.assetId || row.assetName || 'unknown'}`
    );

    imported += 1;
    if (imported % 250 === 0) {
      process.stdout.write(`  Imported ${imported} track rows...\r`);
    }
  }

  return { imported, skipped };
};

const importMileposts = async (pool, directMpRows, subdivisionMap) => {
  let imported = 0;
  let skipped = 0;

  for (const row of directMpRows) {
    if (!row.subdivisionName || row.milepost === null || row.latitude === null || row.longitude === null) {
      skipped += 1;
      continue;
    }

    const subdivisionId = subdivisionMap.get(`*::${row.subdivisionName}`) || subdivisionMap.get(`METRLK::${row.subdivisionName}`);
    if (!subdivisionId) {
      skipped += 1;
      continue;
    }

    await queryWithRetry(
      pool,
      (request) => request
        .input('subdivision_id', sql.Int, subdivisionId)
        .input('milepost', sql.Decimal(10, 4), row.milepost)
        .input('latitude', sql.Decimal(10, 8), row.latitude)
        .input('longitude', sql.Decimal(11, 8), row.longitude)
        .input('apple_url', sql.NVarChar(500), row.appleMapUrl)
        .input('google_url', sql.NVarChar(500), row.googleMapUrl),
      `
        IF NOT EXISTS (
          SELECT 1 FROM Milepost_Geometry
          WHERE Subdivision_ID = @subdivision_id
            AND MP = @milepost
        )
        BEGIN
          INSERT INTO Milepost_Geometry (
            Subdivision_ID, MP, Latitude, Longitude, Apple_Map_URL, Google_Map_URL, Is_Active
          )
          VALUES (
            @subdivision_id, @milepost, @latitude, @longitude, @apple_url, @google_url, 1
          );
        END
      `,
      `importMileposts.${subdivisionId}.${row.milepost}`
    );

    imported += 1;
    if (imported % 500 === 0) {
      process.stdout.write(`  Imported ${imported} milepost rows...\r`);
    }
  }

  return { imported, skipped };
};

const printAgencySummary = async (pool, agencyIds) => {
  const ids = [...new Set(agencyIds)].filter(Boolean);
  if (!ids.length) return;

  for (const agencyId of ids) {
    const summary = await queryWithRetry(
      pool,
      (request) => request.input('agency_id', sql.Int, agencyId),
      `
        SELECT
          @agency_id AS Agency_ID,
          (SELECT COUNT(*) FROM Subdivisions WHERE Agency_ID = @agency_id) AS SubdivisionCount,
          (SELECT COUNT(*)
             FROM Tracks t
             INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agency_id) AS TrackCount,
          (SELECT COUNT(*)
             FROM Milepost_Geometry mg
             INNER JOIN Subdivisions s ON mg.Subdivision_ID = s.Subdivision_ID
            WHERE s.Agency_ID = @agency_id) AS MilepostCount
      `,
      `summary.${agencyId}`
    );
    const row = summary.recordset[0];
    console.log(
      `Agency ${agencyId} summary -> Subdivisions: ${row.SubdivisionCount}, ` +
      `Tracks: ${row.TrackCount}, Mileposts: ${row.MilepostCount}`
    );
  }
};

async function main() {
  let pool = null;
  try {
    const excelFile = resolveExcelFile();
    console.log(`Using Excel file: ${excelFile}`);

    console.log('Connecting to SQL Server...');
    pool = await sql.connect(dbConfig);
    console.log('Connected to SQL Server.\n');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelFile);

    const sheet1 = workbook.getWorksheet('Sheet1');
    const directMp = workbook.getWorksheet('Direct_MP');

    if (!sheet1) throw new Error('Worksheet "Sheet1" not found.');
    if (!directMp) throw new Error('Worksheet "Direct_MP" not found.');

    const sheet1Rows = buildSheet1Rows(sheet1);
    const directMpRows = buildDirectMpRows(directMp);

    console.log(`Sheet1 rows parsed: ${sheet1Rows.length}`);
    console.log(`Direct_MP rows parsed: ${directMpRows.length}\n`);

    const sourceAgencyCodes = [...new Set(sheet1Rows.map((row) => row.agencyCode).filter(Boolean))];
    if (!sourceAgencyCodes.length) {
      throw new Error('No agency codes found in Sheet1.');
    }

    const sourceToTargetAgency = new Map();
    const touchedAgencyIds = [];

    if (targetAgencyId) {
      const agency = await getAgencyById(pool, targetAgencyId);
      if (!agency) {
        throw new Error(`Target agency ID ${targetAgencyId} does not exist.`);
      }
      console.log(`Import target locked to Agency_ID ${agency.Agency_ID} (${agency.Agency_CD || agency.Agency_Name}).`);
      sourceAgencyCodes.forEach((sourceCode) => sourceToTargetAgency.set(sourceCode, agency.Agency_ID));
      touchedAgencyIds.push(agency.Agency_ID);
    } else if (targetAgencyCode) {
      const resolvedId = await getOrCreateAgencyByCode(pool, targetAgencyCode, targetAgencyCode);
      console.log(`Import target locked to Agency_CD ${targetAgencyCode} (Agency_ID ${resolvedId}).`);
      sourceAgencyCodes.forEach((sourceCode) => sourceToTargetAgency.set(sourceCode, resolvedId));
      touchedAgencyIds.push(resolvedId);
    } else {
      for (const sourceCode of sourceAgencyCodes) {
        const agencyId = await getOrCreateAgencyByCode(pool, sourceCode, sourceCode);
        sourceToTargetAgency.set(sourceCode, agencyId);
        touchedAgencyIds.push(agencyId);
      }
      console.log(`Imported agencies from Excel: ${sourceAgencyCodes.join(', ')}`);
    }

    const uniqueSubdivisionRefs = new Map();
    for (const row of sheet1Rows) {
      if (!row.subdivisionName) continue;
      const srcAgency = row.agencyCode || sourceAgencyCodes[0];
      const key = `${srcAgency}::${row.subdivisionName}`;
      uniqueSubdivisionRefs.set(key, { sourceAgency: srcAgency, subdivisionName: row.subdivisionName });
    }

    for (const row of directMpRows) {
      if (!row.subdivisionName) continue;
      // Direct_MP does not include agency; map to wildcard and/or METRLK fallback.
      uniqueSubdivisionRefs.set(`*::${row.subdivisionName}`, { sourceAgency: '*', subdivisionName: row.subdivisionName });
    }

    const subdivisionMap = new Map();
    for (const { sourceAgency, subdivisionName } of uniqueSubdivisionRefs.values()) {
      const agencyId = sourceAgency === '*'
        ? (touchedAgencyIds[0] || sourceToTargetAgency.get(sourceAgencyCodes[0]))
        : sourceToTargetAgency.get(sourceAgency);
      if (!agencyId) continue;
      const subdivisionId = await getOrCreateSubdivision(pool, agencyId, subdivisionName);
      subdivisionMap.set(`${sourceAgency}::${subdivisionName}`, subdivisionId);
      if (sourceAgency !== '*') {
        subdivisionMap.set(`*::${subdivisionName}`, subdivisionId);
      }
    }

    console.log(`Created/verified subdivisions: ${subdivisionMap.size}\n`);

    console.log('Importing Tracks...');
    const trackStats = await importTracks(pool, sheet1Rows, subdivisionMap);
    console.log(`Tracks imported: ${trackStats.imported}, skipped: ${trackStats.skipped}\n`);

    console.log('Importing Milepost_Geometry...');
    const milepostStats = await importMileposts(pool, directMpRows, subdivisionMap);
    console.log(`Mileposts imported: ${milepostStats.imported}, skipped: ${milepostStats.skipped}\n`);

    await printAgencySummary(pool, touchedAgencyIds);

    console.log('\nImport complete.');
    if (!targetAgencyId && !targetAgencyCode) {
      console.log(
        'Tip: If mobile user belongs to another agency, rerun with ' +
        '`--target-agency-id <your mobile Agency_ID>` so map layers can see imported rows.'
      );
    }
  } catch (error) {
    console.error('Import failed:', error.message);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.close();
      console.log('Database connection closed.');
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };


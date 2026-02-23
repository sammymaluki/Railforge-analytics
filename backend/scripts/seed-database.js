#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const isTrue = (value) => String(value || '').trim().toLowerCase() === 'true';

const includeDevFixtures =
  process.env.NODE_ENV !== 'production' &&
  isTrue(process.env.SEED_INCLUDE_DEV_FIXTURES);

const SCRIPTS = [
  'seed-subdivision.js',
  'seed-track-numbers.js',
  'seed-pin-types.js',
  'seed-alert-configs.js',
  'import-metrolink-data.js'
];

const DEV_FIXTURE_SCRIPTS = [
  'seed-sample-tracks.js',
  'seed-audit-logs.js',
  'create-test-user.js',
  'create-test-authority.js',
  'create-test-alerts.js'
];

function run(script) {
  const scriptPath = path.join(__dirname, script);
  console.log('\n==> Running', scriptPath, '\n');
  const res = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit' });
  if (res.error) {
    console.error('Failed to run', script, res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`Script ${script} exited with code ${res.status}`);
    process.exit(res.status);
  }
}

(async function main() {
  const scriptsToRun = includeDevFixtures
    ? [...SCRIPTS, ...DEV_FIXTURE_SCRIPTS]
    : SCRIPTS;

  console.log('Seed mode:', includeDevFixtures ? 'production + dev fixtures' : 'production only');

  for (const s of scriptsToRun) {
    // Skip scripts that don't exist in the folder to remain robust across branches
    try {
      run(s);
    } catch (err) {
      console.error('Error running', s, err);
      process.exit(1);
    }
  }

  console.log('\n✅ Database seeding completed successfully');
  process.exit(0);
})();

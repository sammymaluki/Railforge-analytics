/**
 * Metro Link Data Import Script
 * 
 * This script imports the Metro Link map data from Excel into the database.
 * It handles:
 * - Agency creation (METRLK)
 * - Subdivision creation (VENTURA, MONTALVO)
 * - Pin Types for Metro Link assets
 * - Track assets from Sheet1 (Tracks table)
 * - Milepost geometry data from Sheet2 (Direct_MP)
 * 
 * Usage: node backend/scripts/import-metrolink-data.js
 */

const sql = require('mssql');
const ExcelJS = require('exceljs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Database configuration
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
    appName: 'SidekickMetrolinkImport'
  },
  pool: {
    max: 2,
    min: 1,
    idleTimeoutMillis: 60000,
    acquireTimeoutMillis: 30000
  },
  connectionTimeout: 60000,
  requestTimeout: 60000
};

const TRANSIENT_ERROR_CODES = new Set(['ESOCKET', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientDbError = (error) => {
  if (!error) return false;
  if (error.code && TRANSIENT_ERROR_CODES.has(error.code)) return true;
  const message = String(error.message || '').toLowerCase();
  return (
    message.includes('connection lost') ||
    message.includes('econnreset') ||
    message.includes('failed to connect') ||
    message.includes('timeout')
  );
};

const queryWithRetry = async (requestFactory, query, context, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const request = requestFactory();
      return await request.query(query);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      const delay = 1000 * attempt; // Linear backoff instead of exponential
      console.warn(`  ⚠️  DB query retry ${attempt}/${maxRetries} for ${context} in ${delay}ms: ${error.message}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
};

const connectWithRetry = async (maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await sql.connect(dbConfig);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxRetries) {
        throw error;
      }
      const delay = 2000 * attempt; // Longer delays for connection retries
      console.warn(`⚠️  DB connect retry ${attempt}/${maxRetries} in ${delay}ms: ${error.message}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay);
    }
  }
  throw lastError;
};

const EXCEL_FILE = path.join(__dirname, '../sql/seeds/Metro Link map Data.xlsx');

// Color mapping for different asset types
const ASSET_TYPE_COLORS = {
  'HT_Switch': '#FF6B6B',      // Red for high-speed turnouts
  'PWR_Switch': '#4ECDC4',     // Teal for power switches
  'Storage': '#95E1D3',         // Light green for storage
  'X_Over': '#FFE66D',          // Yellow for crossovers
  'Default': '#6C757D'          // Gray for others
};

// Metro Link Pin Types configuration
const METROLINK_PIN_TYPES = [
  { category: 'Switch', subtype: 'HT Switch', color: ASSET_TYPE_COLORS.HT_Switch, sortOrder: 1 },
  { category: 'Switch', subtype: 'PWR Switch', color: ASSET_TYPE_COLORS.PWR_Switch, sortOrder: 2 },
  { category: 'Track', subtype: 'Storage Track', color: ASSET_TYPE_COLORS.Storage, sortOrder: 3 },
  { category: 'Track', subtype: 'Crossover', color: ASSET_TYPE_COLORS.X_Over, sortOrder: 4 },
  { category: 'Infrastructure', subtype: 'Signal', color: '#9B59B6', sortOrder: 5 },
  { category: 'Infrastructure', subtype: 'Grade Crossing', color: '#E74C3C', sortOrder: 6 }
];

/**
 * Main import function
 */
async function importMetroLinkData() {
  let pool;
  
  try {
    console.log('🚂 Starting Metro Link Data Import...\n');
    
    // Connect to database
    console.log('📡 Connecting to database...');
    pool = await connectWithRetry();
    console.log('✅ Database connected\n');
    
    // Step 1: Create Agencies (METRLK and BNSF)
    const agencyMap = await createAgencies(pool);
    
    // Step 2: Create Subdivisions for all agencies
    const subdivisions = await createSubdivisions(pool, agencyMap);
    
    // Step 3: Create Pin Types for each agency
    // eslint-disable-next-line no-unused-vars
    for (const [agencyCode, agencyId] of Object.entries(agencyMap)) {
      await createPinTypes(pool, agencyId);
    }
    
    // Step 4: Import Excel Data
    await importExcelData(pool, agencyMap, subdivisions);
    
    console.log('\n✅ Metro Link data import completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during import:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('📡 Database connection closed');
    }
  }
}

/**
 * Create agencies from Excel data
 */
async function createAgencies(pool) {
  console.log('🏢 Creating Agencies from Excel...');
  
  // Read Excel to get all unique agencies
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  const sheet1 = workbook.getWorksheet('Sheet1');
  
  const agencies = new Set();
  sheet1.eachRow((row, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      const agencyCode = row.getCell(1).value;
      if (agencyCode) {
        agencies.add(agencyCode.toString().trim());
      }
    }
  });
  
  console.log(`Found ${agencies.size} unique agencies in data: ${Array.from(agencies).join(', ')}`);
  
  const agencyMap = {};
  
  // Agency details mapping
  const agencyDetails = {
    'METRLK': {
      name: 'Metro Link',
      region: 'Southern California',
      contact_email: 'operations@metrolinktrains.com',
      contact_phone: '800-371-5465'
    },
    'BNSF': {
      name: 'BNSF Railway',
      region: 'National',
      contact_email: 'customer.service@bnsf.com',
      contact_phone: '800-795-2673'
    }
  };
  
  // Create each agency
  for (const agencyCode of agencies) {
    const details = agencyDetails[agencyCode] || {
      name: agencyCode,
      region: null,
      contact_email: null,
      contact_phone: null
    };
    
    const result = await queryWithRetry(
      () => pool.request()
        .input('agency_cd', sql.NVarChar(50), agencyCode)
        .input('agency_name', sql.NVarChar(100), details.name)
        .input('region', sql.NVarChar(100), details.region)
        .input('contact_email', sql.NVarChar(100), details.contact_email)
        .input('contact_phone', sql.NVarChar(20), details.contact_phone),
      `
        IF NOT EXISTS (SELECT 1 FROM Agencies WHERE Agency_CD = @agency_cd)
        BEGIN
          INSERT INTO Agencies (Agency_CD, Agency_Name, Region, Contact_Email, Contact_Phone)
          VALUES (@agency_cd, @agency_name, @region, @contact_email, @contact_phone);
        END
        
        SELECT Agency_ID FROM Agencies WHERE Agency_CD = @agency_cd;
      `,
      `createAgencies.${agencyCode}`
    );
    
    const agencyId = result.recordset[0].Agency_ID;
    agencyMap[agencyCode] = agencyId;
    console.log(`✅ Created/verified ${agencyCode} (${details.name}) - ID: ${agencyId}`);
  }
  
  console.log('');
  return agencyMap;
}

/**
 * Create Subdivisions for all agencies
 */
async function createSubdivisions(pool, agencyMap) {
  console.log('🛤️  Creating Subdivisions...');
  
  // Read Excel to get all unique subdivisions per agency
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  const sheet1 = workbook.getWorksheet('Sheet1');
  const sheet2 = workbook.getWorksheet('Direct_MP');
  
  // Map of agency -> subdivisions
  const agencySubdivisions = {};
  
  // Get subdivisions from Sheet1 (column 1: Agency_CD, column 2: Sub_Div)
  sheet1.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return; // Skip header
    }
    const agencyCode = row.values[1] ? row.values[1].toString().trim() : null;
    const subdivision = row.values[2];
    if (agencyCode && subdivision) {
      if (!agencySubdivisions[agencyCode]) {
        agencySubdivisions[agencyCode] = new Set();
      }
      agencySubdivisions[agencyCode].add(subdivision);
    }
  });
  
  // Get subdivisions from Sheet2 (column 1: subdivision - assume METRLK if in this sheet)
  sheet2.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return; // Skip header
    }
    const subdivision = row.values[1];
    if (subdivision) {
      if (!agencySubdivisions['METRLK']) {
        agencySubdivisions['METRLK'] = new Set();
      }
      agencySubdivisions['METRLK'].add(subdivision);
    }
  });
  
  console.log(`  Found subdivisions for ${Object.keys(agencySubdivisions).length} agencies`);
  
  const subdivisions = {};
  
  for (const [agencyCode, subNames] of Object.entries(agencySubdivisions)) {
    const agencyId = agencyMap[agencyCode];
    if (!agencyId) {
      console.log(`  ⚠️  Skipping subdivisions for unknown agency: ${agencyCode}`);
      continue;
    }
    
    console.log(`  Creating ${subNames.size} subdivisions for ${agencyCode}...`);
    
    for (const subName of subNames) {
      // Create a shortened code by removing spaces and limiting length, trim trailing underscores
      // Reduce to 20 chars to avoid truncation issues
      const subCode = subName.replace(/\s+/g, '_').substring(0, 20).replace(/_+$/, '');
      
      const result = await queryWithRetry(
        () => pool.request()
          .input('agency_id', sql.Int, agencyId)
          .input('sub_code', sql.NVarChar(50), subCode)
          .input('sub_name', sql.NVarChar(100), `${subName} Subdivision`)
          .input('region', sql.NVarChar(100), agencyCode === 'BNSF' ? 'National' : 'Southern California'),
        `
          IF NOT EXISTS (SELECT 1 FROM Subdivisions WHERE Agency_ID = @agency_id AND Subdivision_Code = @sub_code)
          BEGIN
            INSERT INTO Subdivisions (Agency_ID, Subdivision_Code, Subdivision_Name, Region)
            VALUES (@agency_id, @sub_code, @sub_name, @region);
          END
          
          SELECT Subdivision_ID FROM Subdivisions WHERE Agency_ID = @agency_id AND Subdivision_Code = @sub_code;
        `,
        `createSubdivisions.${agencyCode}.${subCode}`
      );
      
      // Map using original name (with spaces) as that's what's in the Excel
      subdivisions[subName] = result.recordset[0].Subdivision_ID;
    }
  }
  
  console.log('✅ Created/verified subdivisions for all agencies\n');
  return subdivisions;
}

/**
 * Create Pin Types for Metro Link
 */
async function createPinTypes(pool, agencyId) {
  console.log('📍 Creating Metro Link Pin Types...');
  
  for (const pinType of METROLINK_PIN_TYPES) {
    await queryWithRetry(
      () => pool.request()
        .input('agency_id', sql.Int, agencyId)
        .input('category', sql.NVarChar(100), pinType.category)
        .input('subtype', sql.NVarChar(100), pinType.subtype)
        .input('color', sql.NVarChar(20), pinType.color)
        .input('sort_order', sql.Int, pinType.sortOrder),
      `
        IF NOT EXISTS (SELECT 1 FROM Pin_Types WHERE Agency_ID = @agency_id AND Pin_Category = @category AND Pin_Subtype = @subtype)
        BEGIN
          INSERT INTO Pin_Types (Agency_ID, Pin_Category, Pin_Subtype, Color, Sort_Order)
          VALUES (@agency_id, @category, @subtype, @color, @sort_order);
        END
      `,
      `createPinTypes.${pinType.category}.${pinType.subtype}`
    );
    
    console.log(`  ✅ ${pinType.category} - ${pinType.subtype}`);
  }
  
  console.log('');
}

/**
 * Import Excel data (both sheets)
 */
async function importExcelData(pool, agencyMap, subdivisions) {
  console.log('📊 Reading Excel file...');
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_FILE);
  
  // Sheet 1: Infrastructure Assets
  const sheet1 = workbook.getWorksheet('Sheet1');
  await importTrackAssets(pool, agencyMap, subdivisions, sheet1);
  
  // Sheet 2: Milepost References
  const sheet2 = workbook.getWorksheet('Direct_MP');
  await importMilepostReferences(pool, subdivisions, sheet2);
}

/**
 * Import infrastructure assets from Sheet1 as Pins
 */
async function importInfrastructureAssets(pool, agencyMap, subdivisions, worksheet) {
  console.log('🏗️  Importing Infrastructure Assets from Sheet1...');
  
  let count = 0;
  const rows = [];
  
  // Read all rows (skip header)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return; // Skip header
    }
    rows.push(row.values);
  });
  
  console.log(`  Found ${rows.length} asset records to import`);
  
  for (const rowValues of rows) {
    try {
      const [
        , // Skip first empty index
        agencyCD,
        subdivision,
        assetType,
        switchName,
        trackName,
        bmp,
        emp,
        , , , , , , , , , , , // Skip unused columns
        latDMS,
        , // longDMS (unused)
        latDec,
        longDec
      ] = rowValues;
      
      // Skip rows with missing critical data
      if (!subdivision || (!latDec && !latDMS)) {
        continue;
      }
      
      // Get agency ID
      const agencyId = agencyMap[agencyCD];
      if (!agencyId) {
        console.log(`  ⚠️  Skipping asset for unknown agency: ${agencyCD}`);
        continue;
      }
      
      // Parse coordinates
      let latitude = latDec;
      let longitude = longDec;
      
      // If decimal coords not available, skip for now (could add DMS parser)
      if (!latitude || !longitude) {
        continue;
      }
      
      // Get subdivision ID
      const subdivisionId = subdivisions[subdivision];
      if (!subdivisionId) {
        console.log(`  ⚠️  Unknown subdivision: ${subdivision}`);
        continue;
      }
      
      // Get appropriate pin type
      const pinTypeResult = await pool.request()
        .input('agency_id', sql.Int, agencyId)
        .query(`
          SELECT TOP 1 Pin_Type_ID 
          FROM Pin_Types 
          WHERE Agency_ID = @agency_id 
          AND Pin_Category = 'Infrastructure'
          ORDER BY Sort_Order
        `);
      
      if (pinTypeResult.recordset.length === 0) {
        console.log('  ⚠️  No pin types found, skipping assets');
        break;
      }
      
      const pinTypeId = pinTypeResult.recordset[0].Pin_Type_ID;
      
      // Create description from available data
      const description = [
        assetType ? `Type: ${assetType}` : '',
        switchName ? `Switch: ${switchName}` : '',
        trackName ? `Track: ${trackName}` : '',
        bmp ? `BMP: ${bmp}` : '',
        emp ? `EMP: ${emp}` : ''
      ].filter(Boolean).join(' | ');
      
      // Insert pin (Authority_ID is NULL for infrastructure pins, they're not tied to work authorities)
      await pool.request()
        .input('pin_type_id', sql.Int, pinTypeId)
        .input('latitude', sql.Decimal(10, 7), latitude)
        .input('longitude', sql.Decimal(11, 7), longitude)
        .input('track_type', sql.NVarChar(50), assetType || null)
        .input('track_number', sql.NVarChar(50), (switchName || trackName) ? String(switchName || trackName).substring(0, 50) : null)
        .input('mp', sql.Decimal(10, 2), bmp || null)
        .input('notes', sql.NVarChar(sql.MAX), description || null)
        .query(`
          INSERT INTO Pins (Pin_Type_ID, Latitude, Longitude, Track_Type, Track_Number, MP, Notes)
          VALUES (@pin_type_id, @latitude, @longitude, @track_type, @track_number, @mp, @notes);
        `);
      
      count++;
      
      if (count % 10 === 0) {
        process.stdout.write(`  Imported ${count} assets...\r`);
      }
      
    } catch (error) {
      console.error('  ❌ Error importing row:', error.message);
    }
  }
  
  console.log(`✅ Imported ${count} infrastructure assets\n`);
}

/**
 * Normalize track type to match DB constraints
 */
function normalizeTrackType(value) {
  if (!value) return null;
  const raw = value.toString().trim().toUpperCase();
  if (raw === 'MAIN' || raw === 'MN') return 'Main';
  if (raw === 'YD' || raw === 'YARD') return 'Yard';
  if (raw === 'SD' || raw === 'SIDING') return 'Siding';
  if (raw === 'ST' || raw === 'STORAGE') return 'Storage';
  if (raw === 'XOVER' || raw === 'X-OVER' || raw === 'X_OVER' || raw === 'CROSSOVER') return 'X_Over';
  return 'Other';
}

/**
 * Normalize asset type to match DB constraints
 */
function normalizeAssetType(value) {
  if (!value) return null;
  const raw = value.toString().trim();
  const upper = raw.toUpperCase();
  if (upper === 'SWITCH') return 'Switch';
  if (upper === 'SIGNAL') return 'Signal';
  if (upper === 'CROSSING' || upper === 'ROAD CROSSING' || upper === 'RAIL CROSSING') return 'Crossing';
  return 'Other';
}

/**
 * Normalize asset status to match DB constraints
 */
function normalizeAssetStatus(value) {
  if (!value) return null;
  const upper = value.toString().trim().toUpperCase();
  if (['ACTIVE', 'INACTIVE', 'PLANNED', 'REMOVED'].includes(upper)) return upper;
  return null;
}

/**
 * Import track assets from Sheet1 into Tracks
 */
async function importTrackAssets(pool, agencyMap, subdivisions, worksheet) {
  console.log('ðŸ—ï¸  Importing Track Assets from Sheet1...');

  let count = 0;
  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    rows.push(row.values);
  });

  console.log(`  Found ${rows.length} asset records to import`);

  for (const rowValues of rows) {
    try {
      const [
        ,
        agencyCD,
        subdivision,
        region,
        ls,
        trackType,
        trackNumber,
        divergingTrackType,
        divergingTrackNumber,
        facingDirection,
        mpSuffix,
        bmp,
        emp,
        assetName,
        assetType,
        assetSubType,
        assetId,
        dotNumber,
        legacyAssetNumber,
        assetDesc,
        assetStatus,
        latitude,
        longitude,
        department,
        notes
      ] = rowValues;

      if (!subdivision || latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
        continue;
      }

      const agencyId = agencyMap[agencyCD];
      if (!agencyId) {
        console.log(`  âš ï¸  Skipping asset for unknown agency: ${agencyCD}`);
        continue;
      }

      const subdivisionId = subdivisions[subdivision];
      if (!subdivisionId) {
        console.log(`  âš ï¸  Unknown subdivision: ${subdivision}`);
        continue;
      }

      const normalizedTrackType = normalizeTrackType(trackType);
      const normalizedDivergingTrackType = normalizeTrackType(divergingTrackType);
      const normalizedAssetType = normalizeAssetType(assetType);
      const normalizedAssetStatus = normalizeAssetStatus(assetStatus);
      const resolvedAssetSubType = assetSubType || (normalizedAssetType === 'Other' && assetType ? assetType : null);

      await queryWithRetry(
        () => pool.request()
          .input('subdivision_id', sql.Int, subdivisionId)
          .input('ls', sql.VarChar(50), ls || null)
          .input('track_type', sql.VarChar(20), normalizedTrackType)
          .input('track_number', sql.VarChar(20), trackNumber ? trackNumber.toString() : null)
          .input('div_track_type', sql.VarChar(20), normalizedDivergingTrackType)
          .input('div_track_number', sql.VarChar(20), divergingTrackNumber ? divergingTrackNumber.toString() : null)
          .input('facing_direction', sql.VarChar(10), facingDirection || null)
          .input('mp_suffix', sql.VarChar(10), mpSuffix || null)
          .input('bmp', sql.Decimal(10, 4), bmp || null)
          .input('emp', sql.Decimal(10, 4), emp || null)
          .input('asset_name', sql.NVarChar(200), assetName || null)
          .input('asset_type', sql.VarChar(50), normalizedAssetType || null)
          .input('asset_subtype', sql.VarChar(50), resolvedAssetSubType || null)
          .input('asset_id', sql.VarChar(100), assetId || null)
          .input('dot_number', sql.VarChar(50), dotNumber || null)
          .input('legacy_asset_number', sql.VarChar(50), legacyAssetNumber || null)
          .input('asset_desc', sql.NVarChar(500), assetDesc || null)
          .input('asset_status', sql.VarChar(20), normalizedAssetStatus || null)
          .input('latitude', sql.Decimal(10, 8), latitude)
          .input('longitude', sql.Decimal(11, 8), longitude)
          .input('department', sql.VarChar(50), department || null)
          .input('notes', sql.NVarChar(sql.MAX), notes || null),
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
        `importTrackAssets.${subdivisionId}.${assetId || assetName || 'unknown'}`
      );

      count++;

      if (count % 25 === 0) {
        process.stdout.write(`  Imported ${count} tracks...\r`);
      }
    } catch (error) {
      console.error('  âŒ Error importing row:', error.message);
    }
  }

  console.log(`âœ… Imported ${count} track assets\n`);
}

/**
 * Import milepost reference data from Sheet2
 */
async function importMilepostReferences(pool, subdivisions, worksheet) {
  console.log('📏 Importing Milepost Geometry from Direct_MP sheet...');
  
  let count = 0;
  const rows = [];
  
  // Read all rows (skip header)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return; // Skip header
    }
    rows.push(row.values);
  });
  
  console.log(`  Found ${rows.length} milepost records to import`);
  
  for (const rowValues of rows) {
    try {
      const [
        , // Skip first empty index
        subdivision,
        milepost,
        latitude,
        longitude,
        appleMapUrl,
        googleMapUrl
      ] = rowValues;
      
      // Skip rows with missing data
      if (!subdivision || !milepost || !latitude || !longitude) {
        continue;
      }
      
      // Get subdivision ID
      const subdivisionId = subdivisions[subdivision];
      if (!subdivisionId) {
        console.log(`  ⚠️  Unknown subdivision: ${subdivision}`);
        continue;
      }
      
      // Insert milepost geometry
      await queryWithRetry(
        () => pool.request()
          .input('subdivision_id', sql.Int, subdivisionId)
          .input('milepost', sql.Decimal(10, 4), milepost)
          .input('latitude', sql.Decimal(10, 8), latitude)
          .input('longitude', sql.Decimal(11, 8), longitude)
          .input('apple_url', sql.NVarChar(500), appleMapUrl || null)
          .input('google_url', sql.NVarChar(500), googleMapUrl || null),
        `
          IF NOT EXISTS (SELECT 1 FROM Milepost_Geometry WHERE Subdivision_ID = @subdivision_id AND MP = @milepost)
          BEGIN
            INSERT INTO Milepost_Geometry (
              Subdivision_ID, MP, Latitude, Longitude, Apple_Map_URL, Google_Map_URL, Is_Active
            )
            VALUES (
              @subdivision_id, @milepost, @latitude, @longitude, @apple_url, @google_url, 1
            );
          END
        `,
        `importMilepostReferences.${subdivisionId}.${milepost}`
      );
      
      count++;
      
      if (count % 50 === 0) {
        process.stdout.write(`  Imported ${count} mileposts...\r`);
      }
      
    } catch (error) {
      console.error('  ❌ Error importing milepost:', error.message);
    }
  }
  
  console.log(`✅ Imported ${count} milepost geometry rows\n`);
}

// Run the import
if (require.main === module) {
  importMetroLinkData()
    .then(() => {
      console.log('\n🎉 Import completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importMetroLinkData };

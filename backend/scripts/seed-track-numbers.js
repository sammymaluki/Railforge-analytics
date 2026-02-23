/**
 * Seed Track Numbers for Metro Link
 * 
 * Reads the Metro Link map Data.xlsx file and extracts all unique track numbers
 * for the VENTURA subdivision, then inserts them into a Tracks reference table.
 * 
 * Usage: node backend/scripts/seed-track-numbers.js
 */

require('dotenv').config();
const sql = require('mssql');
const ExcelJS = require('exceljs');
const path = require('path');

// Database configuration
const dbConfig = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'HerzogRailAuthority',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'YourStrong!Passw0rd',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1434,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 15000
  }
};

const EXCEL_FILE = path.join(__dirname, '../sql/seeds/Metro Link map Data.xlsx');

// Map Excel Track_Type values to database values
const TRACK_TYPE_MAP = {
  'M': 'Main',
  'YD': 'Yard',
  'SIDING': 'Siding',
  'STORAGE': 'Storage',
  'X_Over': 'X_Over',
  'XOVER': 'X_Over',
};

async function seedTrackNumbers() {
  let pool;
  
  try {
    console.log('🚂 Seeding Metro Link Track Numbers...\n');
    
    // Connect to database
    console.log('Connected to SQL Server successfully');
    pool = await sql.connect(dbConfig);
    
    // Get METRLK agency ID
    const agencyResult = await pool.request()
      .input('agency_cd', sql.NVarChar(50), 'METRLK')
      .query('SELECT Agency_ID FROM Agencies WHERE Agency_CD = @agency_cd');
    
    if (agencyResult.recordset.length === 0) {
      throw new Error('METRLK agency not found. Please run seed-subdivisions.js first.');
    }
    
    const agencyId = agencyResult.recordset[0].Agency_ID;
    console.log(`Using agency: METRLK (ID: ${agencyId})\n`);
    
    // Read Excel file
    console.log('Reading Excel file...');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE);
    const sheet = workbook.getWorksheet('Sheet1');
    
    if (!sheet) {
      throw new Error('Sheet1 not found in Excel file');
    }
    
    // Parse track data from Excel
    // Columns: 1=Agency_CD, 2=Sub_Div, 5=Track_Type, 6=Track_Number
    const trackData = new Map(); // Map of subdivision -> Set of {track_type, track_number}
    
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return; // Skip header
      }
      
      const values = row.values;
      const subDiv = values[2] ? values[2].toString().trim() : null;
      const trackTypeRaw = values[5] ? values[5].toString().trim() : null;
      const trackNumber = values[6] ? values[6].toString().trim() : null;
      
      // Map Excel track type to database track type
      const trackType = trackTypeRaw ? (TRACK_TYPE_MAP[trackTypeRaw] || 'Other') : null;
      
      if (subDiv && trackType && trackNumber) {
        if (!trackData.has(subDiv)) {
          trackData.set(subDiv, new Set());
        }
        trackData.get(subDiv).add(JSON.stringify({ trackType, trackNumber }));
      }
    });
    
    console.log(`Found ${trackData.size} subdivisions with track data\n`);
    
    // Process each subdivision
    let totalInserted = 0;
    
    for (const [subDivName, trackSet] of trackData.entries()) {
      // Get subdivision ID
      const subResult = await pool.request()
        .input('agency_id', sql.Int, agencyId)
        .input('sub_code', sql.NVarChar(50), subDivName)
        .query(`
          SELECT Subdivision_ID 
          FROM Subdivisions 
          WHERE Agency_ID = @agency_id 
          AND Subdivision_Code = @sub_code
        `);
      
      if (subResult.recordset.length === 0) {
        console.log(`  ⚠️  Subdivision '${subDivName}' not found, skipping...`);
        continue;
      }
      
      const subdivisionId = subResult.recordset[0].Subdivision_ID;
      console.log(`Processing ${subDivName} (ID: ${subdivisionId})...`);
      
      // Insert each unique track
      const tracks = Array.from(trackSet).map(s => JSON.parse(s));
      let insertedCount = 0;
      
      for (const { trackType, trackNumber } of tracks) {
        // Check if track already exists
        const existsResult = await pool.request()
          .input('subdivision_id', sql.Int, subdivisionId)
          .input('track_type', sql.NVarChar(20), trackType)
          .input('track_number', sql.NVarChar(20), trackNumber)
          .query(`
            SELECT Track_ID 
            FROM Tracks 
            WHERE Subdivision_ID = @subdivision_id 
            AND Track_Type = @track_type 
            AND Track_Number = @track_number
          `);
        
        if (existsResult.recordset.length === 0) {
          // Insert new track
          await pool.request()
            .input('subdivision_id', sql.Int, subdivisionId)
            .input('track_type', sql.NVarChar(20), trackType)
            .input('track_number', sql.NVarChar(20), trackNumber)
            .query(`
              INSERT INTO Tracks (
                Subdivision_ID, 
                Track_Type, 
                Track_Number,
                Asset_Status,
                Created_Date,
                Modified_Date
              )
              VALUES (
                @subdivision_id, 
                @track_type, 
                @track_number,
                'ACTIVE',
                GETDATE(),
                GETDATE()
              )
            `);
          
          insertedCount++;
        }
      }
      
      console.log(`  ✓ Inserted ${insertedCount} new tracks (${tracks.length} total unique tracks)\n`);
      totalInserted += insertedCount;
    }
    
    // Display all METRLK tracks
    const allTracksResult = await pool.request()
      .input('agency_id', sql.Int, agencyId)
      .query(`
        SELECT 
          t.Track_ID,
          s.Subdivision_Code,
          t.Track_Type,
          t.Track_Number
        FROM Tracks t
        INNER JOIN Subdivisions s ON t.Subdivision_ID = s.Subdivision_ID
        WHERE s.Agency_ID = @agency_id
        ORDER BY s.Subdivision_Code, t.Track_Type, t.Track_Number
      `);
    
    console.log(`✅ Total METRLK tracks: ${allTracksResult.recordset.length}`);
    console.log(`   Newly inserted: ${totalInserted}\n`);
    
    // Group by subdivision
    const tracksBySubdiv = {};
    allTracksResult.recordset.forEach(track => {
      if (!tracksBySubdiv[track.Subdivision_Code]) {
        tracksBySubdiv[track.Subdivision_Code] = [];
      }
      tracksBySubdiv[track.Subdivision_Code].push(track);
    });
    
    // Display summary
    for (const [subDiv, tracks] of Object.entries(tracksBySubdiv)) {
      console.log(`   ${subDiv}: ${tracks.length} tracks`);
      const uniqueNumbers = [...new Set(tracks.map(t => t.Track_Number))];
      console.log(`      Track Numbers: ${uniqueNumbers.join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ Error seeding track numbers:', error);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('\nDatabase connection closed');
    }
  }
}

// Run the seeding
console.log('🌱 Seeding Metro Link Track Numbers...\n');
seedTrackNumbers()
  .then(() => {
    console.log('\n🎉 Track number seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed track numbers:', error);
    process.exit(1);
  });

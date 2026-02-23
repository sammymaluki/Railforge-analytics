require('dotenv').config();
const { connectToDatabase, closeConnection, getConnection, sql } = require('../src/config/database');

async function seedSample() {
  try {
    await connectToDatabase();
    const pool = getConnection();

    // Ensure there is at least one subdivision for agency 2 (dev agency created earlier)
    const agencyId = 2;

    let subdivRes = await pool.request()
      .input('agencyId', sql.Int, agencyId)
      .query('SELECT TOP 1 Subdivision_ID FROM Subdivisions WHERE Agency_ID = @agencyId');

    let subdivisionId;
    if (subdivRes.recordset.length === 0) {
      const ins = await pool.request()
        .input('agencyId', sql.Int, agencyId)
        .input('code', sql.NVarChar, `${agencyId}-SAMPLE`)
        .input('name', sql.NVarChar, 'Sample Subdivision')
        .input('region', sql.NVarChar, 'Dev')
        .query(`INSERT INTO Subdivisions (Agency_ID, Subdivision_Code, Subdivision_Name, Region) OUTPUT INSERTED.Subdivision_ID VALUES (@agencyId, @code, @name, @region)`);

      subdivisionId = ins.recordset[0].Subdivision_ID;
    } else {
      subdivisionId = subdivRes.recordset[0].Subdivision_ID;
    }

    console.log('Using subdivision id', subdivisionId);

    // Insert a simple track polyline (store as series of points in Tracks table BMP/EMP and a representative lat/lon)
    let trackId;
    const existingTrack = await pool.request()
      .input('subdivisionId', sql.Int, subdivisionId)
      .input('ls', sql.NVarChar, 'LS01')
      .query(`SELECT TOP 1 Track_ID FROM Tracks WHERE Subdivision_ID = @subdivisionId AND LS = @ls`);

    if (existingTrack.recordset.length > 0) {
      trackId = existingTrack.recordset[0].Track_ID;
      console.log('Using existing track id', trackId);
    } else {
      const trackInsert = await pool.request()
        .input('subdivisionId', sql.Int, subdivisionId)
        .input('ls', sql.NVarChar, 'LS01')
        .input('trackType', sql.NVarChar, 'Main')
        .input('trackNumber', sql.NVarChar, '1')
        .input('bmp', sql.Decimal(10,4), 0)
        .input('emp', sql.Decimal(10,4), 10)
        .input('assetName', sql.NVarChar, 'Sample Line')
        .input('lat', sql.Decimal(10,8), 40.0)
        .input('lon', sql.Decimal(11,8), -75.0)
        .input('assetStatus', sql.NVarChar, 'ACTIVE')
        .query(`
          INSERT INTO Tracks (Subdivision_ID, LS, Track_Type, Track_Number, BMP, EMP, Asset_Name, Latitude, Longitude, Asset_Status)
          OUTPUT INSERTED.Track_ID
          VALUES (@subdivisionId, @ls, @trackType, @trackNumber, @bmp, @emp, @assetName, @lat, @lon, @assetStatus)
        `);

      trackId = trackInsert.recordset[0].Track_ID;
      console.log('Inserted track id', trackId);
    }

    // Insert simple milepost geometry along the track every 1 MP
    const mileposts = [];
    for (let i = 0; i <= 10; i++) {
      mileposts.push({ mp: i, lat: 40.0 + i * 0.001, lon: -75.0 + i * 0.001 });
    }

    let inserted = 0;
    for (const mp of mileposts) {
      await pool.request()
        .input('subdivisionId', sql.Int, subdivisionId)
        .input('mp', sql.Decimal(10,4), mp.mp)
        .input('lat', sql.Decimal(10,8), mp.lat)
        .input('lon', sql.Decimal(11,8), mp.lon)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM Milepost_Geometry 
            WHERE Subdivision_ID = @subdivisionId AND MP = @mp
          )
          BEGIN
            INSERT INTO Milepost_Geometry (Subdivision_ID, MP, Latitude, Longitude)
            VALUES (@subdivisionId, @mp, @lat, @lon)
          END
        `);
      inserted++;
    }

    console.log(`Inserted ${inserted} mileposts`);

    await closeConnection();
    console.log('Seeding complete');
  } catch (err) {
    console.error('Seed error', err.message || err);
    process.exit(1);
  }
}

if (require.main === module) seedSample();

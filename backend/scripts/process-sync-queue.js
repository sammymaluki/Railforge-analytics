require('dotenv').config();
const { connectToDatabase, closeConnection, getConnection, sql } = require('../src/config/database');
const { logger } = require('../src/config/logger');

async function processQueue(batchSize = 50) {
  try {
    await connectToDatabase();
    const pool = getConnection();

    // Fetch pending items
    const result = await pool.request()
      .input('status', sql.NVarChar, 'Pending')
      .input('batch', sql.Int, batchSize)
      .query(`SELECT TOP (@batch) * FROM Data_Sync_Queue WHERE Sync_Status = @status ORDER BY Created_Date`);

    const items = result.recordset;
    console.log(`Processing ${items.length} sync items`);

    for (const item of items) {
      const tx = new sql.Transaction(pool);
      try {
        await tx.begin();
        const request = tx.request();

        const data = JSON.parse(item.Sync_Data || '{}');

        if ((item.Table_Name || '').toLowerCase() === 'pins' && (item.Operation || '').toUpperCase() === 'INSERT') {
          // Insert into Pins table
          const insertReq = tx.request();
          insertReq.input('authorityId', sql.Int, data.authorityId || data.Authority_ID || null);
          insertReq.input('pinTypeId', sql.Int, data.pinTypeId || data.Pin_Type_ID || null);
          insertReq.input('latitude', sql.Decimal(10,8), data.latitude || data.Latitude || null);
          insertReq.input('longitude', sql.Decimal(11,8), data.longitude || data.Longitude || null);
          insertReq.input('trackType', sql.NVarChar, data.trackType || data.Track_Type || null);
          insertReq.input('trackNumber', sql.NVarChar, data.trackNumber || data.Track_Number || null);
          insertReq.input('mp', sql.Decimal(10,4), data.mp || data.MP || null);
          insertReq.input('notes', sql.NVarChar, data.notes || data.Notes || null);
          insertReq.input('photoUrl', sql.NVarChar, data.photoUrl || data.Photo_URL || null);
          insertReq.input('photoUrls', sql.NVarChar(sql.MAX), data.photoUrls ? JSON.stringify(data.photoUrls) : (data.Photo_URLs || null));
          insertReq.input('photoMetadata', sql.NVarChar(sql.MAX), data.photoMetadata ? JSON.stringify(data.photoMetadata) : (data.Photo_Metadata || null));

          const insertResult = await insertReq.query(`
            INSERT INTO Pins (
              Authority_ID, Pin_Type_ID, Latitude, Longitude,
              Track_Type, Track_Number, MP, Notes, Photo_URL, Photo_URLs, Photo_Metadata
            ) OUTPUT INSERTED.Pin_ID VALUES (
              @authorityId, @pinTypeId, @latitude, @longitude,
              @trackType, @trackNumber, @mp, @notes, @photoUrl, @photoUrls, @photoMetadata
            )
          `);

          const insertedPin = insertResult.recordset[0];

          // Mark queue as processed and set Record_ID to new Pin_ID
          await request.input('syncId', sql.BigInt, item.Sync_ID)
            .input('recordId', sql.Int, insertedPin.Pin_ID)
            .query(`UPDATE Data_Sync_Queue SET Sync_Status='Processed', Record_ID=@recordId, Attempts=Attempts+1, Last_Attempt=GETDATE() WHERE Sync_ID=@syncId`);
        } else {
          // Unknown table: mark as Failed with message
          await request.input('syncId', sql.BigInt, item.Sync_ID)
            .input('msg', sql.NVarChar, `Unsupported table ${item.Table_Name}`)
            .query(`UPDATE Data_Sync_Queue SET Sync_Status='Failed', Error_Message=@msg, Attempts=Attempts+1, Last_Attempt=GETDATE() WHERE Sync_ID=@syncId`);
        }

        await tx.commit();
        console.log(`Processed sync id ${item.Sync_ID}`);
      } catch (err) {
        try { await tx.rollback(); } catch (e) {}
        console.error('Failed processing item', item.Sync_ID, err.message || err);
        try {
          await pool.request()
            .input('syncId', sql.BigInt, item.Sync_ID)
            .input('msg', sql.NVarChar, err.message || String(err))
            .query(`UPDATE Data_Sync_Queue SET Sync_Status='Failed', Error_Message=@msg, Attempts=Attempts+1, Last_Attempt=GETDATE() WHERE Sync_ID=@syncId`);
        } catch (uerr) {
          console.error('Failed to update queue status after failure:', uerr.message || uerr);
        }
      }
    }

    await closeConnection();
  } catch (error) {
    console.error('Sync worker error:', error);
    process.exit(1);
  }
}

// Run once; can be scheduled with cron or long-running process
if (require.main === module) {
  const batch = parseInt(process.argv[2], 10) || 50;
  processQueue(batch).then(() => process.exit(0));
}

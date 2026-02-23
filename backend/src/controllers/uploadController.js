const { getPublicUrl } = require('../config/upload');
const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');
const dataValidationService = require('../services/dataValidationService');
const XLSX = require('xlsx');

class UploadController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.uploadPinPhoto = this.uploadPinPhoto.bind(this);
    this.uploadTrackData = this.uploadTrackData.bind(this);
    this.uploadMilepostGeometry = this.uploadMilepostGeometry.bind(this);
    this.downloadTrackTemplate = this.downloadTrackTemplate.bind(this);
    this.downloadMilepostTemplate = this.downloadMilepostTemplate.bind(this);
    this.processTrackData = this.processTrackData.bind(this);
    this.processMilepostData = this.processMilepostData.bind(this);
  }

  async uploadPinPhoto(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const user = req.user;
      const { authorityId, pinId } = req.body;
      const pool = getConnection();

      // Verify authority belongs to user if authorityId is provided
      if (authorityId) {
        const authorityQuery = `
          SELECT 1 
          FROM Authorities 
          WHERE Authority_ID = @authorityId 
            AND User_ID = @userId 
            AND Is_Active = 1
        `;

        const authorityResult = await pool.request()
          .input('authorityId', sql.Int, authorityId)
          .input('userId', sql.Int, user.User_ID)
        .query(authorityQuery);

        if (authorityResult.recordset.length === 0) {
          // Remove uploaded file since authority is invalid
          const fs = require('fs');
          fs.unlinkSync(req.file.path);
          
          return res.status(403).json({
            success: false,
            error: 'Authority not found or access denied'
          });
        }
      }

      // Get public URL for the file
      const photoUrl = getPublicUrl(req.file.path);

      if (pinId) {
        // Update existing pin with photo
        const updateQuery = `
          UPDATE Pins
          SET Photo_URL = @photoUrl, Modified_Date = GETDATE()
          WHERE Pin_ID = @pinId AND Authority_ID = @authorityId
        `;

        await pool.request()
          .input('pinId', sql.Int, pinId)
          .input('authorityId', sql.Int, authorityId)
          .input('photoUrl', sql.NVarChar, photoUrl)
          .query(updateQuery);
      }

      logger.info(`Photo uploaded for authority ${authorityId} by user ${user.User_ID}`);

      res.json({
        success: true,
        data: {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: photoUrl
        },
        message: 'Photo uploaded successfully'
      });

    } catch (error) {
      logger.error('Upload pin photo error:', error);
      
      // Clean up file on error
      if (req.file && req.file.path) {
        const fs = require('fs');
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          logger.error('Failed to cleanup file:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to upload photo'
      });
    }
  }

  async uploadTrackData(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const user = req.user;
      const { agencyId, dataType } = req.body;

      if (!agencyId) {
        return res.status(400).json({
          success: false,
          error: 'Agency ID is required'
        });
      }

      // Only administrators can upload track data
      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can upload track data'
        });
      }

      // Check file type
      const fileExt = req.file.originalname.split('.').pop().toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
        
        return res.status(400).json({
          success: false,
          error: 'Only Excel (.xlsx, .xls) or CSV files are allowed'
        });
      }

      // Process based on data type
      let result;
      switch (dataType) {
      case 'tracks':
        result = await this.processTrackData(req.file.buffer, agencyId);
        break;
      case 'mileposts':
        result = await this.processMilepostData(req.file.buffer, agencyId);
        break;
      default:
        throw new Error(`Unknown data type: ${dataType}`);
      }

      logger.info(`Track data uploaded for agency ${agencyId} by user ${user.User_ID}, type: ${dataType}`);

      res.json({
        success: true,
        data: result,
        message: `${dataType} data imported successfully`
      });

    } catch (error) {
      logger.error('Upload track data error:', error);
      
      // Clean up file on error
      if (req.file && req.file.path) {
        const fs = require('fs');
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          logger.error('Failed to cleanup file:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        error: `Failed to upload track data: ${error.message}`
      });
    }
  }

  async processTrackData(fileBuffer, agencyId) {
    const pool = getConnection();
    
    try {
      // Read Excel file from buffer
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      let imported = 0;
      let skipped = 0;
      const errors = [];
      
      for (const row of data) {
        try {
          // Validate required fields based on provided Excel structure
          if (!row.Sub_Div || !row.Track_Type) {
            errors.push(`Missing required fields in row: ${JSON.stringify(row)}`);
            continue;
          }
          
          // Get subdivision ID
          const subdivQuery = `
            SELECT Subdivision_ID 
            FROM Subdivisions 
            WHERE Subdivision_Code = @subdivisionCode 
              AND Agency_ID = @agencyId
          `;
          
          const subdivResult = await pool.request()
            .input('subdivisionCode', sql.NVarChar, row.Sub_Div)
            .input('agencyId', sql.Int, agencyId)
            .query(subdivQuery);
          
          if (subdivResult.recordset.length === 0) {
            errors.push(`Subdivision not found: ${row.Sub_Div}`);
            skipped++;
            continue;
          }
          
          const subdivisionId = subdivResult.recordset[0].Subdivision_ID;
          
          // Insert track data
          const insertQuery = `
            INSERT INTO Tracks (
              Subdivision_ID, LS, Track_Type, Track_Number,
              Diverging_Track_Type, Diverging_Track_Number, Facing_Direction,
              MP_Suffix, BMP, EMP, Asset_Name, Asset_Type, Asset_SubType,
              Asset_ID, DOT_Number, Legacy_Asset_Number, Asset_Desc,
              Asset_Status, Latitude, Longitude, Department, Notes
            )
            VALUES (
              @subdivisionId, @ls, @trackType, @trackNumber,
              @divergingTrackType, @divergingTrackNumber, @facingDirection,
              @mpSuffix, @bmp, @emp, @assetName, @assetType, @assetSubType,
              @assetId, @dotNumber, @legacyAssetNumber, @assetDesc,
              @assetStatus, @latitude, @longitude, @department, @notes
            )
          `;
          
          await pool.request()
            .input('subdivisionId', sql.Int, subdivisionId)
            .input('ls', sql.NVarChar, row.LS || null)
            .input('trackType', sql.NVarChar, row.Track_Type)
            .input('trackNumber', sql.NVarChar, row.Track_Number || null)
            .input('divergingTrackType', sql.NVarChar, row.Diverging_Track_Type || null)
            .input('divergingTrackNumber', sql.NVarChar, row.Diverging_Track_Number || null)
            .input('facingDirection', sql.NVarChar, row.Facing_Direction || null)
            .input('mpSuffix', sql.NVarChar, row.MP_Suffix || null)
            .input('bmp', sql.Decimal(10,4), row.BMP || 0)
            .input('emp', sql.Decimal(10,4), row.EMP || 0)
            .input('assetName', sql.NVarChar, row.Asset_Name || null)
            .input('assetType', sql.NVarChar, row.Asset_Type || null)
            .input('assetSubType', sql.NVarChar, row.Asset_SubType || null)
            .input('assetId', sql.NVarChar, row.Asset_ID || null)
            .input('dotNumber', sql.NVarChar, row.DOT_Number || null)
            .input('legacyAssetNumber', sql.NVarChar, row.Legacy_Asset_Number || null)
            .input('assetDesc', sql.NVarChar, row.Asset_Desc || null)
            .input('assetStatus', sql.NVarChar, row.Asset_Status || 'ACTIVE')
            .input('latitude', sql.Decimal(10,8), row.Latitude || null)
            .input('longitude', sql.Decimal(11,8), row.Longitude || null)
            .input('department', sql.NVarChar, row.Department || null)
            .input('notes', sql.NVarChar, row.Notes || null)
            .query(insertQuery);
          
          imported++;
          
        } catch (rowError) {
          errors.push(`Error processing row: ${rowError.message}`);
          skipped++;
        }
      }
      
      return {
        imported,
        skipped,
        total: data.length,
        errors: errors.length,
        messages: errors.slice(0, 10).map(err => ({ type: 'error', message: err }))
      };
      
    } catch (error) {
      logger.error('Process track data error:', error);
      throw error;
    }
  }

  async processMilepostData(fileBuffer, agencyId) {
    const pool = getConnection();

    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const preferredSheet = workbook.SheetNames.find((name) => name.toLowerCase().includes('direct_mp'))
        || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[preferredSheet];
      const data = XLSX.utils.sheet_to_json(worksheet);

      let imported = 0;
      let skipped = 0;
      const errors = [];

      for (const row of data) {
        try {
          const subdivisionCode = row.Sub_Div || row.Subdivision || row.Subdivision_Code || row.SUB_DIV;
          const milepost = row.MP ?? row.Milepost ?? row.MILEPOST;
          const latitude = row.Latitude ?? row.LATITUDE;
          const longitude = row.Longitude ?? row.LONGITUDE;
          const trackType = row.Track_Type || row.TRACK_TYPE || null;
          const trackNumber = row.Track_Number || row.TRACK_NUMBER || null;
          const elevation = row.Elevation ?? row.ELEVATION ?? null;

          if (!subdivisionCode || milepost === undefined || latitude === undefined || longitude === undefined) {
            skipped += 1;
            errors.push(`Missing required columns in row: ${JSON.stringify(row)}`);
            continue;
          }

          const subdivisionResult = await pool.request()
            .input('agencyId', sql.Int, agencyId)
            .input('subdivisionCode', sql.NVarChar, String(subdivisionCode).trim())
            .query(`
              SELECT TOP 1 Subdivision_ID
              FROM Subdivisions
              WHERE Agency_ID = @agencyId
                AND (
                  UPPER(Subdivision_Code) = UPPER(@subdivisionCode)
                  OR UPPER(Subdivision_Name) = UPPER(@subdivisionCode)
                  OR UPPER(Subdivision_Name) = UPPER(@subdivisionCode + ' Subdivision')
                )
            `);

          if (!subdivisionResult.recordset.length) {
            skipped += 1;
            errors.push(`Subdivision not found: ${subdivisionCode}`);
            continue;
          }

          const subdivisionId = subdivisionResult.recordset[0].Subdivision_ID;

          await pool.request()
            .input('subdivisionId', sql.Int, subdivisionId)
            .input('trackType', sql.VarChar(50), trackType)
            .input('trackNumber', sql.VarChar(10), trackNumber ? String(trackNumber) : null)
            .input('mp', sql.Decimal(10, 4), parseFloat(milepost))
            .input('latitude', sql.Decimal(10, 7), parseFloat(latitude))
            .input('longitude', sql.Decimal(11, 7), parseFloat(longitude))
            .input('elevation', sql.Decimal(10, 2), elevation !== null ? parseFloat(elevation) : null)
            .query(`
              IF NOT EXISTS (
                SELECT 1
                FROM Milepost_Geometry
                WHERE Subdivision_ID = @subdivisionId
                  AND MP = @mp
              )
              BEGIN
                INSERT INTO Milepost_Geometry (
                  Subdivision_ID, Track_Type, Track_Number, MP, Latitude, Longitude, Elevation, Is_Active
                )
                VALUES (
                  @subdivisionId, @trackType, @trackNumber, @mp, @latitude, @longitude, @elevation, 1
                )
              END
            `);

          imported += 1;
        } catch (rowError) {
          skipped += 1;
          errors.push(`Error processing row: ${rowError.message}`);
        }
      }

      return {
        imported,
        skipped,
        total: data.length,
        errors: errors.length,
        messages: errors.slice(0, 20).map((err) => ({ type: 'error', message: err })),
      };
    } catch (error) {
      logger.error('Process milepost data error:', error);
      throw error;
    }
  }

  /**
   * Upload and validate milepost geometry data (Excel/CSV)
   */
  async uploadMilepostGeometry(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Only administrators can upload milepost geometry
      if (req.user.role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can upload milepost geometry'
        });
      }

      const { subdivisionId } = req.body;

      if (!subdivisionId) {
        return res.status(400).json({
          success: false,
          message: 'Subdivision ID is required'
        });
      }

      // Validate file
      const fileValidation = dataValidationService.validateFileUpload(req.file);
      if (!fileValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file',
          errors: fileValidation.errors
        });
      }

      // Parse file
      const parseResult = dataValidationService.parseFile(req.file.buffer, fileValidation.fileType);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: parseResult.error
        });
      }

      // Validate data
      const validation = dataValidationService.validateMilepostGeometry(parseResult.data);

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Data validation failed',
          errors: validation.errors,
          warnings: validation.warnings
        });
      }

      // Insert data into database
      const pool = getConnection();
      const transaction = pool.transaction();

      try {
        await transaction.begin();

        let insertedCount = 0;
        const errors = [];

        for (const row of parseResult.data) {
          try {
            const query = `
              INSERT INTO Milepost_Geometry (
                Subdivision_ID, Track_Type, Track_Number, 
                MP, Latitude, Longitude, Elevation
              )
              VALUES (
                @subdivisionId, @trackType, @trackNumber,
                @mp, @latitude, @longitude, @elevation
              )
            `;

            const request = transaction.request();
            request.input('subdivisionId', sql.Int, row.Subdivision_ID || subdivisionId);
            request.input('trackType', sql.VarChar(50), row.Track_Type);
            request.input('trackNumber', sql.VarChar(10), row.Track_Number);
            request.input('mp', sql.Decimal(10, 4), parseFloat(row.MP));
            request.input('latitude', sql.Decimal(10, 7), parseFloat(row.Latitude));
            request.input('longitude', sql.Decimal(11, 7), parseFloat(row.Longitude));
            request.input('elevation', sql.Decimal(10, 2), row.Elevation ? parseFloat(row.Elevation) : null);

            await request.query(query);
            insertedCount++;
          } catch (error) {
            errors.push(`Row ${insertedCount + 1}: ${error.message}`);
          }
        }

        await transaction.commit();

        logger.info(`Milepost geometry uploaded: ${insertedCount} records by user ${req.user.userId}`);

        res.json({
          success: true,
          data: {
            inserted: insertedCount,
            total: parseResult.data.length,
            warnings: validation.warnings,
            errors: errors.length > 0 ? errors : undefined
          },
          message: `Successfully imported ${insertedCount} of ${parseResult.data.length} milepost geometry records`
        });
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error uploading milepost geometry:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload milepost geometry',
        error: error.message
      });
    }
  }

  /**
   * Download track data template
   */
  async downloadTrackTemplate(req, res) {
    try {
      const templateData = dataValidationService.generateTrackTemplate();
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(wb, ws, 'Tracks');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename=track_template.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      logger.error('Error generating track template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate template',
        error: error.message
      });
    }
  }

  /**
   * Download milepost geometry template
   */
  async downloadMilepostTemplate(req, res) {
    try {
      const templateData = dataValidationService.generateMilepostGeometryTemplate();
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(wb, ws, 'Milepost_Geometry');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename=milepost_geometry_template.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      logger.error('Error generating milepost template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate template',
        error: error.message
      });
    }
  }
}

module.exports = new UploadController();

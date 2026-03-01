const { getPublicUrl } = require('../config/upload');
const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');
const dataValidationService = require('../services/dataValidationService');
const XLSX = require('xlsx');
const { isGlobalAdmin } = require('../utils/rbac');

class UploadController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.uploadPinPhoto = this.uploadPinPhoto.bind(this);
    this.uploadTrackData = this.uploadTrackData.bind(this);
    this.uploadMilepostGeometry = this.uploadMilepostGeometry.bind(this);
    this.uploadUsers = this.uploadUsers.bind(this);
    this.downloadTrackTemplate = this.downloadTrackTemplate.bind(this);
    this.downloadMilepostTemplate = this.downloadMilepostTemplate.bind(this);
    this.downloadUsersTemplate = this.downloadUsersTemplate.bind(this);
    this.processTrackData = this.processTrackData.bind(this);
    this.processMilepostData = this.processMilepostData.bind(this);
  }

  normalizeSubdivisionKey(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s_]+/g, '');
  }

  parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  toNullableString(value) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).replace(/\u00A0/g, ' ').trim();
    return normalized.length ? normalized : null;
  }

  normalizeTrackType(value) {
    const raw = this.toNullableString(value);
    if (!raw) return 'Other';

    const key = raw.toUpperCase().replace(/\s+/g, '');
    const map = {
      M: 'Main',
      MAIN: 'Main',
      YD: 'Yard',
      YARD: 'Yard',
      SIDING: 'Siding',
      STORAGE: 'Storage',
      XOVER: 'X_Over',
      X_OVER: 'X_Over',
      'X-OVER': 'X_Over',
      OTHER: 'Other',
    };

    return map[key] || 'Other';
  }

  normalizeAssetType(value) {
    const raw = this.toNullableString(value);
    if (!raw) return 'Other';
    const key = raw.toUpperCase();
    if (['SWITCH', 'SIGNAL', 'CROSSING', 'OTHER'].includes(key)) {
      return key.charAt(0) + key.slice(1).toLowerCase();
    }
    return 'Other';
  }

  normalizeAssetStatus(value) {
    const raw = this.toNullableString(value);
    if (!raw) return 'ACTIVE';
    const key = raw.toUpperCase();
    if (['ACTIVE', 'INACTIVE', 'PLANNED', 'REMOVED'].includes(key)) {
      return key;
    }
    return 'ACTIVE';
  }

  async resolveSubdivisionId(pool, agencyId, subdivisionRaw) {
    const rawValue = String(subdivisionRaw || '').trim();
    if (!rawValue) return null;

    const normalizedValue = this.normalizeSubdivisionKey(rawValue);

    const result = await pool.request()
      .input('agencyId', sql.Int, Number(agencyId))
      .input('rawSubdivision', sql.NVarChar, rawValue)
      .input('normalizedSubdivision', sql.NVarChar, normalizedValue)
      .query(`
        SELECT TOP 1 Subdivision_ID
        FROM Subdivisions
        WHERE Agency_ID = @agencyId
          AND (
            UPPER(LTRIM(RTRIM(Subdivision_Code))) = UPPER(@rawSubdivision)
            OR UPPER(LTRIM(RTRIM(Subdivision_Name))) = UPPER(@rawSubdivision)
            OR REPLACE(REPLACE(UPPER(LTRIM(RTRIM(Subdivision_Code))), '_', ''), ' ', '') = @normalizedSubdivision
            OR REPLACE(REPLACE(UPPER(LTRIM(RTRIM(Subdivision_Name))), '_', ''), ' ', '') = @normalizedSubdivision
          )
        ORDER BY Subdivision_ID
      `);

    return result.recordset[0]?.Subdivision_ID || null;
  }

  async createSubdivision(pool, agencyId, subdivisionRaw) {
    const subdivisionName = String(subdivisionRaw || '').trim();
    if (!subdivisionName) return null;

    // Generate a deterministic code from the incoming value, max 20 chars.
    const normalized = this.normalizeSubdivisionKey(subdivisionName);
    let code = normalized.slice(0, 20) || 'SUBDIV';

    // Ensure uniqueness of code per agency.
    const existingCode = await pool.request()
      .input('agencyId', sql.Int, Number(agencyId))
      .input('code', sql.VarChar(20), code)
      .query(`
        SELECT TOP 1 Subdivision_ID
        FROM Subdivisions
        WHERE Agency_ID = @agencyId
          AND Subdivision_Code = @code
      `);

    if (existingCode.recordset.length > 0) {
      const suffix = String(Math.abs(this.normalizeSubdivisionKey(subdivisionName).split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 10000).padStart(4, '0');
      code = `${code.slice(0, 15)}${suffix}`;
    }

    const insertResult = await pool.request()
      .input('agencyId', sql.Int, Number(agencyId))
      .input('code', sql.VarChar(20), code)
      .input('name', sql.NVarChar(100), subdivisionName)
      .query(`
        INSERT INTO Subdivisions (Agency_ID, Subdivision_Code, Subdivision_Name, Is_Active)
        OUTPUT INSERTED.Subdivision_ID
        VALUES (@agencyId, @code, @name, 1)
      `);

    return insertResult.recordset[0]?.Subdivision_ID || null;
  }

  async resolveAgencyIdByCode(pool, agencyCodeRaw) {
    const agencyCode = this.toNullableString(agencyCodeRaw);
    if (!agencyCode) return null;

    const result = await pool.request()
      .input('agencyCode', sql.VarChar(20), agencyCode.toUpperCase())
      .query(`
        SELECT TOP 1 Agency_ID
        FROM Agencies
        WHERE UPPER(Agency_CD) = @agencyCode
      `);

    return result.recordset[0]?.Agency_ID || null;
  }

  async createAgencyByCode(pool, agencyCodeRaw) {
    const agencyCode = this.toNullableString(agencyCodeRaw);
    if (!agencyCode) return null;

    const normalizedCode = agencyCode.toUpperCase().slice(0, 20);
    const agencyName = `${normalizedCode} Agency`;

    const result = await pool.request()
      .input('agencyCode', sql.VarChar(20), normalizedCode)
      .input('agencyName', sql.NVarChar(100), agencyName)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM Agencies WHERE UPPER(Agency_CD) = UPPER(@agencyCode))
        BEGIN
          INSERT INTO Agencies (Agency_CD, Agency_Name, Is_Active)
          VALUES (@agencyCode, @agencyName, 1)
        END

        SELECT TOP 1 Agency_ID
        FROM Agencies
        WHERE UPPER(Agency_CD) = UPPER(@agencyCode)
      `);

    return result.recordset[0]?.Agency_ID || null;
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
      const { authorityId, pinId, pinTypeId } = req.body;
      const pool = getConnection();

      if (pinTypeId) {
        const pinTypeResult = await pool.request()
          .input('pinTypeId', sql.Int, pinTypeId)
          .query(`
            SELECT TOP 1 Photos_Enabled, Max_Photo_Size_MB
            FROM Pin_Types
            WHERE Pin_Type_ID = @pinTypeId
              AND Is_Active = 1
          `);

        const pinType = pinTypeResult.recordset[0];
        if (pinType) {
          if (pinType.Photos_Enabled === false) {
            const fs = require('fs');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              error: 'Photos are disabled for this category'
            });
          }

          const maxBytes = Number(pinType.Max_Photo_Size_MB || 10) * 1024 * 1024;
          if (req.file.size > maxBytes) {
            const fs = require('fs');
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              error: `Photo exceeds max size of ${pinType.Max_Photo_Size_MB}MB for this category`
            });
          }
        }
      }

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
      const createMissingSubdivisions = this.parseBoolean(req.body.createMissingSubdivisions, false);
      const useAgencyCodeFromFile = this.parseBoolean(req.body.useAgencyCodeFromFile, false);
      const createMissingAgencies = this.parseBoolean(req.body.createMissingAgencies, false);

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

      if ((useAgencyCodeFromFile || createMissingAgencies) && !isGlobalAdmin(user)) {
        return res.status(403).json({
          success: false,
          error: 'Only global administrators can import using Agency_CD from file or create missing agencies'
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
        result = await this.processTrackData(req.file.buffer, agencyId, {
          createMissingSubdivisions,
          useAgencyCodeFromFile,
          createMissingAgencies,
        });
        break;
      case 'mileposts':
        result = await this.processMilepostData(req.file.buffer, agencyId, {
          createMissingSubdivisions,
          useAgencyCodeFromFile,
          createMissingAgencies,
        });
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

  async processTrackData(fileBuffer, agencyId, options = {}) {
    const pool = getConnection();
    const createMissingSubdivisions = Boolean(options.createMissingSubdivisions);
    const useAgencyCodeFromFile = Boolean(options.useAgencyCodeFromFile);
    const createMissingAgencies = Boolean(options.createMissingAgencies);
    
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
            skipped++;
            continue;
          }

          const subdivisionLabel = String(row.Sub_Div).trim();
          let targetAgencyId = Number(agencyId);
          if (useAgencyCodeFromFile) {
            const agencyCodeFromRow = row.Agency_CD || row.Agency_Code || row.AgencyCode || row.Agency;
            if (agencyCodeFromRow) {
              targetAgencyId = await this.resolveAgencyIdByCode(pool, agencyCodeFromRow);
              if (!targetAgencyId && createMissingAgencies) {
                targetAgencyId = await this.createAgencyByCode(pool, agencyCodeFromRow);
              }
              if (!targetAgencyId) {
                errors.push(`Agency not found for Agency_CD: ${agencyCodeFromRow}`);
                skipped++;
                continue;
              }
            }
          }

          let subdivisionId = await this.resolveSubdivisionId(pool, targetAgencyId, subdivisionLabel);

          if (!subdivisionId && createMissingSubdivisions) {
            subdivisionId = await this.createSubdivision(pool, targetAgencyId, subdivisionLabel);
          }

          if (!subdivisionId) {
            errors.push(`Subdivision not found: ${subdivisionLabel}`);
            skipped++;
            continue;
          }
          
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
            .input('ls', sql.NVarChar, this.toNullableString(row.LS))
            .input('trackType', sql.NVarChar, this.normalizeTrackType(row.Track_Type))
            .input('trackNumber', sql.NVarChar, this.toNullableString(row.Track_Number))
            .input('divergingTrackType', sql.NVarChar, this.normalizeTrackType(row.Diverging_Track_Type))
            .input('divergingTrackNumber', sql.NVarChar, this.toNullableString(row.Diverging_Track_Number))
            .input('facingDirection', sql.NVarChar, this.toNullableString(row.Facing_Direction))
            .input('mpSuffix', sql.NVarChar, this.toNullableString(row.MP_Suffix))
            .input('bmp', sql.Decimal(10,4), row.BMP || 0)
            .input('emp', sql.Decimal(10,4), row.EMP || 0)
            .input('assetName', sql.NVarChar, this.toNullableString(row.Asset_Name))
            .input('assetType', sql.NVarChar, this.normalizeAssetType(row.Asset_Type))
            .input('assetSubType', sql.NVarChar, this.toNullableString(row.Asset_SubType))
            .input('assetId', sql.NVarChar, this.toNullableString(row.Asset_ID))
            .input('dotNumber', sql.NVarChar, this.toNullableString(row.DOT_Number))
            .input('legacyAssetNumber', sql.NVarChar, this.toNullableString(row.Legacy_Asset_Number))
            .input('assetDesc', sql.NVarChar, this.toNullableString(row.Asset_Desc))
            .input('assetStatus', sql.NVarChar, this.normalizeAssetStatus(row.Asset_Status))
            .input('latitude', sql.Decimal(10,8), row.Latitude || null)
            .input('longitude', sql.Decimal(11,8), row.Longitude || null)
            .input('department', sql.NVarChar, this.toNullableString(row.Department))
            .input('notes', sql.NVarChar, this.toNullableString(row.Notes))
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

  async processMilepostData(fileBuffer, agencyId, options = {}) {
    const pool = getConnection();
    const createMissingSubdivisions = Boolean(options.createMissingSubdivisions);
    const useAgencyCodeFromFile = Boolean(options.useAgencyCodeFromFile);
    const createMissingAgencies = Boolean(options.createMissingAgencies);

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
          const trackType = this.normalizeTrackType(row.Track_Type || row.TRACK_TYPE || null);
          const trackNumber = row.Track_Number || row.TRACK_NUMBER || null;
          const elevation = row.Elevation ?? row.ELEVATION ?? null;

          if (!subdivisionCode || milepost === undefined || latitude === undefined || longitude === undefined) {
            skipped += 1;
            errors.push(`Missing required columns in row: ${JSON.stringify(row)}`);
            continue;
          }

          let targetAgencyId = Number(agencyId);
          if (useAgencyCodeFromFile) {
            const agencyCodeFromRow = row.Agency_CD || row.Agency_Code || row.AgencyCode || row.Agency;
            if (agencyCodeFromRow) {
              targetAgencyId = await this.resolveAgencyIdByCode(pool, agencyCodeFromRow);
              if (!targetAgencyId && createMissingAgencies) {
                targetAgencyId = await this.createAgencyByCode(pool, agencyCodeFromRow);
              }
              if (!targetAgencyId) {
                skipped += 1;
                errors.push(`Agency not found for Agency_CD: ${agencyCodeFromRow}`);
                continue;
              }
            }
          }

          let subdivisionId = await this.resolveSubdivisionId(pool, targetAgencyId, subdivisionCode);
          if (!subdivisionId && createMissingSubdivisions) {
            subdivisionId = await this.createSubdivision(pool, targetAgencyId, subdivisionCode);
          }
          if (!subdivisionId) {
            skipped += 1;
            errors.push(`Subdivision not found: ${subdivisionCode}`);
            continue;
          }

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
      if (req.user.Role !== 'Administrator') {
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

        logger.info(`Milepost geometry uploaded: ${insertedCount} records by user ${req.user.User_ID}`);

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

  /**
   * Download users import template
   */
  async downloadUsersTemplate(req, res) {
    try {
      const templateData = dataValidationService.generateUsersTemplate();
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(wb, ws, 'Users');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', 'attachment; filename=users_template.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      logger.error('Error generating users template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate template',
        error: error.message
      });
    }
  }

  /**
   * Upload and import users
   */
  async uploadUsers(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      const user = req.user;
      
      // Check if user is administrator
      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can import users'
        });
      }

      // Parse file
      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data || data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No data found in file'
        });
      }

      const pool = getConnection();
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process each user record
      for (let i = 0; i < data.length; i++) {
        try {
          const row = data[i];
          const { Username, Email, Full_Name, Role, Agency_CD } = row;

          // Validate required fields
          if (!Username || !Email || !Full_Name) {
            results.failed += 1;
            results.errors.push(`Row ${i + 2}: Missing required fields (Username, Email, Full_Name)`);
            continue;
          }

          // Validate role
          const validRoles = ['Administrator', 'Supervisor', 'Field_Worker', 'Viewer'];
          if (!validRoles.includes(Role)) {
            results.failed += 1;
            results.errors.push(`Row ${i + 2}: Invalid role "${Role}"`);
            continue;
          }

          // Get agency by code
          const agencyRequest = pool.request()
            .input('Agency_CD', sql.VarChar(10), Agency_CD);
          const agencyResult = await agencyRequest.query('SELECT Agency_ID FROM Agencies WHERE Agency_CD = @Agency_CD');
          
          if (agencyResult.recordset.length === 0) {
            results.failed += 1;
            results.errors.push(`Row ${i + 2}: Agency code "${Agency_CD}" not found`);
            continue;
          }

          const agencyId = agencyResult.recordset[0].Agency_ID;

          // Check if username already exists
          const checkRequest = pool.request()
            .input('Username', sql.NVarChar(100), Username);
          const checkResult = await checkRequest.query('SELECT User_ID FROM Users WHERE Username = @Username');

          if (checkResult.recordset.length > 0) {
            results.failed += 1;
            results.errors.push(`Row ${i + 2}: Username "${Username}" already exists`);
            continue;
          }

          // Generate temporary password (simple hash)
          const crypto = require('crypto');
          const tempPassword = crypto.randomBytes(8).toString('hex');
          const hashedPassword = crypto.createHash('sha256').update(tempPassword).digest('hex');

          // Insert new user
          const insertRequest = pool.request()
            .input('Username', sql.NVarChar(100), Username)
            .input('Email', sql.VarChar(100), Email)
            .input('Employee_Name', sql.NVarChar(100), Full_Name)
            .input('Password_Hash', sql.VarChar(255), hashedPassword)
            .input('Role', sql.VarChar(20), Role)
            .input('Agency_ID', sql.Int, agencyId)
            .input('Is_Active', sql.Bit, 1);

          await insertRequest.query(`
            INSERT INTO Users (Username, Email, Employee_Name, Password_Hash, Role, Agency_ID, Is_Active)
            VALUES (@Username, @Email, @Employee_Name, @Password_Hash, @Role, @Agency_ID, @Is_Active)
          `);

          results.successful += 1;
        } catch (rowError) {
          results.failed += 1;
          results.errors.push(`Row ${i + 2}: ${rowError.message}`);
        }
      }

      res.json({
        success: true,
        message: `Users import completed: ${results.successful} successful, ${results.failed} failed`,
        data: results
      });
    } catch (error) {
      logger.error('Upload users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload users',
        error: error.message
      });
    }
  }
}

module.exports = new UploadController();

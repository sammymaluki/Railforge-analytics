const XLSX = require('xlsx');
const { logger } = require('../config/logger');

/**
 * Data Validation Service
 * Validates imported data for tracks, milepost geometry, and other bulk imports
 */

class DataValidationService {
  /**
   * Validate track data
   */
  validateTrackData(trackData) {
    const errors = [];
    const warnings = [];

    // Required fields
    const requiredFields = ['Subdivision_ID', 'Track_Type', 'Track_Number', 'Begin_MP', 'End_MP'];
    
    trackData.forEach((row, index) => {
      const rowNum = index + 2; // Account for header row

      // Check required fields
      requiredFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          errors.push(`Row ${rowNum}: Missing required field '${field}'`);
        }
      });

      // Validate Subdivision_ID
      if (row.Subdivision_ID && !Number.isInteger(Number(row.Subdivision_ID))) {
        errors.push(`Row ${rowNum}: Subdivision_ID must be an integer`);
      }

      // Validate Track_Type
      const validTrackTypes = ['Main', 'Siding', 'Yard', 'Industrial', 'Other'];
      if (row.Track_Type && !validTrackTypes.includes(row.Track_Type)) {
        warnings.push(`Row ${rowNum}: Track_Type '${row.Track_Type}' is not standard. Valid types: ${validTrackTypes.join(', ')}`);
      }

      // Validate mileposts
      if (row.Begin_MP !== undefined && row.Begin_MP !== null) {
        const beginMP = parseFloat(row.Begin_MP);
        if (isNaN(beginMP) || beginMP < 0) {
          errors.push(`Row ${rowNum}: Begin_MP must be a non-negative number`);
        }
      }

      if (row.End_MP !== undefined && row.End_MP !== null) {
        const endMP = parseFloat(row.End_MP);
        if (isNaN(endMP) || endMP < 0) {
          errors.push(`Row ${rowNum}: End_MP must be a non-negative number`);
        }
      }

      // Validate Begin_MP < End_MP
      if (row.Begin_MP !== undefined && row.End_MP !== undefined) {
        const beginMP = parseFloat(row.Begin_MP);
        const endMP = parseFloat(row.End_MP);
        if (!isNaN(beginMP) && !isNaN(endMP) && beginMP >= endMP) {
          errors.push(`Row ${rowNum}: Begin_MP (${beginMP}) must be less than End_MP (${endMP})`);
        }
      }

      // Validate Track_Number
      if (row.Track_Number && String(row.Track_Number).length > 10) {
        errors.push(`Row ${rowNum}: Track_Number cannot exceed 10 characters`);
      }

      // Check for duplicates within the file
      const duplicates = trackData.filter((r, i) => 
        i !== index &&
        r.Subdivision_ID === row.Subdivision_ID &&
        r.Track_Type === row.Track_Type &&
        r.Track_Number === row.Track_Number &&
        r.Begin_MP === row.Begin_MP
      );
      
      if (duplicates.length > 0 && index < trackData.indexOf(duplicates[0])) {
        warnings.push(`Row ${rowNum}: Duplicate track found in file`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recordCount: trackData.length
    };
  }

  /**
   * Validate milepost geometry data
   */
  validateMilepostGeometry(geometryData) {
    const errors = [];
    const warnings = [];

    // Required fields
    const requiredFields = ['Subdivision_ID', 'Track_Type', 'Track_Number', 'MP', 'Latitude', 'Longitude'];
    
    geometryData.forEach((row, index) => {
      const rowNum = index + 2;

      // Check required fields
      requiredFields.forEach(field => {
        if (row[field] === undefined || row[field] === null || row[field] === '') {
          errors.push(`Row ${rowNum}: Missing required field '${field}'`);
        }
      });

      // Validate Subdivision_ID
      if (row.Subdivision_ID && !Number.isInteger(Number(row.Subdivision_ID))) {
        errors.push(`Row ${rowNum}: Subdivision_ID must be an integer`);
      }

      // Validate Milepost
      if (row.MP !== undefined && row.MP !== null) {
        const mp = parseFloat(row.MP);
        if (isNaN(mp) || mp < 0) {
          errors.push(`Row ${rowNum}: MP must be a non-negative number`);
        }
      }

      // Validate Latitude (-90 to 90)
      if (row.Latitude !== undefined && row.Latitude !== null) {
        const lat = parseFloat(row.Latitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
          errors.push(`Row ${rowNum}: Latitude must be between -90 and 90`);
        }
      }

      // Validate Longitude (-180 to 180)
      if (row.Longitude !== undefined && row.Longitude !== null) {
        const lon = parseFloat(row.Longitude);
        if (isNaN(lon) || lon < -180 || lon > 180) {
          errors.push(`Row ${rowNum}: Longitude must be between -180 and 180`);
        }
      }

      // Validate Elevation if provided
      if (row.Elevation !== undefined && row.Elevation !== null && row.Elevation !== '') {
        const elev = parseFloat(row.Elevation);
        if (isNaN(elev)) {
          warnings.push(`Row ${rowNum}: Elevation is not a valid number`);
        }
      }

      // Check for duplicate coordinates
      const duplicates = geometryData.filter((r, i) => 
        i !== index &&
        r.Subdivision_ID === row.Subdivision_ID &&
        r.Track_Type === row.Track_Type &&
        r.Track_Number === row.Track_Number &&
        r.MP === row.MP
      );
      
      if (duplicates.length > 0 && index < geometryData.indexOf(duplicates[0])) {
        warnings.push(`Row ${rowNum}: Duplicate milepost found in file`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recordCount: geometryData.length
    };
  }

  /**
   * Parse Excel/CSV file to JSON
   */
  parseFile(buffer, fileType) {
    try {
      let workbook;
      
      if (fileType === 'csv') {
        // Parse CSV
        const csvString = buffer.toString('utf-8');
        workbook = XLSX.read(csvString, { type: 'string' });
      } else {
        // Parse Excel
        workbook = XLSX.read(buffer, { type: 'buffer' });
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: null
      });

      return {
        success: true,
        data: jsonData,
        sheetName: firstSheetName,
        rowCount: jsonData.length
      };
    } catch (error) {
      logger.error('Error parsing file:', error);
      return {
        success: false,
        error: `Failed to parse file: ${error.message}`
      };
    }
  }

  /**
   * Validate file upload
   */
  validateFileUpload(file, allowedExtensions = ['.xlsx', '.xls', '.csv']) {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return { isValid: false, errors };
    }

    // Check file extension
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      errors.push(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`);
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      errors.push('File size exceeds 10MB limit');
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileType: ext.substring(1) // Remove the dot
    };
  }

  /**
   * Generate sample template data
   */
  generateTrackTemplate() {
    return [
      {
        Subdivision_ID: 1,
        Agency_ID: 1,
        Track_Type: 'Main',
        Track_Number: '1',
        Begin_MP: 0.0,
        End_MP: 125.5,
        Description: 'Main Track 1',
        Is_Active: 1
      },
      {
        Subdivision_ID: 1,
        Agency_ID: 1,
        Track_Type: 'Siding',
        Track_Number: 'S1',
        Begin_MP: 10.5,
        End_MP: 11.2,
        Description: 'Siding at MP 10.5',
        Is_Active: 1
      }
    ];
  }

  /**
   * Generate sample milepost geometry template
   */
  generateMilepostGeometryTemplate() {
    return [
      {
        Subdivision_ID: 1,
        Agency_ID: 1,
        Track_Type: 'Main',
        Track_Number: '1',
        MP: 0.0,
        Latitude: 35.1234,
        Longitude: -106.5678,
        Elevation: 5280.0
      },
      {
        Subdivision_ID: 1,
        Agency_ID: 1,
        Track_Type: 'Main',
        Track_Number: '1',
        MP: 0.1,
        Latitude: 35.1235,
        Longitude: -106.5679,
        Elevation: 5281.0
      }
    ];
  }

  /**
   * Generate sample user import template
   */
  generateUsersTemplate() {
    return [
      {
        Username: 'jsmith',
        Email: 'john.smith@example.com',
        Full_Name: 'John Smith',
        Role: 'Field_Worker',
        Agency_CD: 'METRLK'
      },
      {
        Username: 'mjones',
        Email: 'mary.jones@example.com',
        Full_Name: 'Mary Jones',
        Role: 'Supervisor',
        Agency_CD: 'METRLK'
      }
    ];
  }
}

module.exports = new DataValidationService();

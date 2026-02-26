const { poolPromise } = require('../config/database');
const sql = require('mssql');
const emailService = require('../services/emailService');
const { logger } = require('../config/logger');
const PDFDocument = require('pdfkit');

class TripReportController {
  /**
   * Generate and email trip report
   * POST /api/trip-reports/email
   */
  async emailTripReport(req, res) {
    try {
      const { authorityId, email, includeGPSLogs = false } = req.body;
      const user = req.user;

      if (!authorityId) {
        return res.status(400).json({ error: 'Authority ID is required' });
      }

      if (!email) {
        return res.status(400).json({ error: 'Email address is required' });
      }

      const pool = await poolPromise;

      // Get authority details
      const authorityResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .input('userId', sql.Int, user.User_ID)
        .query(`
          SELECT a.*, 
                 s.Subdivision_Name,
                 ag.Agency_Name
          FROM Authorities a
          LEFT JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
          LEFT JOIN Agencies ag ON a.Agency_ID = ag.Agency_ID
          WHERE a.Authority_ID = @authorityId
            AND a.User_ID = @userId
        `);

      if (authorityResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Authority not found' });
      }

      const authority = authorityResult.recordset[0];

      // Get pins for this authority
      const pinsResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .query(`
          SELECT p.*,
                 pt.Pin_Category,
                 pt.Pin_Subtype,
                 pt.Color,
                 pt.Photo_Export_Mode
          FROM Pins p
          LEFT JOIN Pin_Types pt ON p.Pin_Type_ID = pt.Pin_Type_ID
          WHERE p.Authority_ID = @authorityId
          ORDER BY p.Created_At
        `);

      const pins = pinsResult.recordset;

      // Get GPS logs if requested
      let gpsLogs = [];
      if (includeGPSLogs) {
        const gpsResult = await pool.request()
          .input('authorityId', sql.Int, authorityId)
          .query(`
            SELECT TOP 100
              Latitude,
              Longitude,
              Accuracy,
              Altitude,
              Speed,
              Heading,
              Created_At
            FROM GPS_Logs
            WHERE Authority_ID = @authorityId
            ORDER BY Created_At DESC
          `);
        gpsLogs = gpsResult.recordset;
      }

      // Get agency details
      const agencyResult = await pool.request()
        .input('agencyId', sql.Int, user.Agency_ID)
        .query('SELECT * FROM Agencies WHERE Agency_ID = @agencyId');

      const agency = agencyResult.recordset[0];

      // Calculate trip summary
      const tripSummary = {
        totalPins: pins.length,
        startTime: authority.Created_At,
        endTime: authority.End_Time || new Date(),
        subdivision: authority.Subdivision_Name,
        track: `${authority.Track_Type} ${authority.Track_Number}`,
        beginMP: authority.Begin_MP,
        endMP: authority.End_MP,
      };

      // Prepare report data
      const reportData = {
        authority,
        pins,
        gpsLogs,
        user: {
          User_ID: user.User_ID,
          Employee_Name: user.Employee_Name || authority.Employee_Name_Display,
          Employee_Contact: user.Employee_Contact || authority.Employee_Contact_Display,
        },
        agency,
        trip: tripSummary,
      };

      // Send email
      await emailService.sendTripReportEmail(reportData, [email]);

      logger.info(`Trip report emailed for authority ${authorityId} to ${email}`);

      res.json({
        success: true,
        message: 'Trip report sent successfully',
        summary: {
          authorityId,
          totalPins: pins.length,
          emailSentTo: email,
        },
      });
    } catch (error) {
      logger.error('Email trip report error:', error);
      res.status(500).json({ error: 'Failed to send trip report email' });
    }
  }

  /**
   * Generate PDF trip report
   * GET /api/trip-reports/:authorityId/pdf
   */
  async generatePDFReport(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;

      const pool = await poolPromise;

      // Get authority details
      const authorityResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .input('userId', sql.Int, user.User_ID)
        .query(`
          SELECT a.*, 
                 s.Subdivision_Name,
                 ag.Agency_Name
          FROM Authorities a
          LEFT JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
          LEFT JOIN Agencies ag ON a.Agency_ID = ag.Agency_ID
          WHERE a.Authority_ID = @authorityId
            AND a.User_ID = @userId
        `);

      if (authorityResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Authority not found' });
      }

      const authority = authorityResult.recordset[0];

      // Get pins
      const pinsResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .query(`
          SELECT p.*,
                 pt.Pin_Category,
                 pt.Pin_Subtype,
                 pt.Color,
                 pt.Photo_Export_Mode
          FROM Pins p
          LEFT JOIN Pin_Types pt ON p.Pin_Type_ID = pt.Pin_Type_ID
          WHERE p.Authority_ID = @authorityId
          ORDER BY p.Created_At
        `);

      const pins = pinsResult.recordset;

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="trip-report-${authorityId}-${Date.now()}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);

      // Add content
      doc.fontSize(20).text('Rail Authority Trip Report', { align: 'center' });
      doc.moveDown();

      // Authority Info
      doc.fontSize(14).text('Authority Details', { underline: true });
      doc.fontSize(10);
      doc.text(`Employee: ${authority.Employee_Name_Display}`);
      doc.text(`Contact: ${authority.Employee_Contact_Display}`);
      doc.text(`Agency: ${authority.Agency_Name}`);
      doc.text(`Subdivision: ${authority.Subdivision_Name}`);
      doc.text(`Track: ${authority.Track_Type} ${authority.Track_Number}`);
      doc.text(`Authority: MP ${authority.Begin_MP} to MP ${authority.End_MP}`);
      doc.text(`Type: ${authority.Authority_Type}`);
      doc.text(`Start: ${new Date(authority.Created_At).toLocaleString()}`);
      if (authority.End_Time) {
        doc.text(`End: ${new Date(authority.End_Time).toLocaleString()}`);
      }
      doc.moveDown();

      // Pins Section
      doc.fontSize(14).text('Pin Drops', { underline: true });
      doc.fontSize(10);
      
      if (pins.length === 0) {
        doc.text('No pins recorded');
      } else {
        pins.forEach((pin, index) => {
          doc.moveDown(0.5);
          doc.text(`${index + 1}. ${pin.Pin_Category} - ${pin.Pin_Subtype}`);
          doc.text(`   Location: ${pin.Track_Type} ${pin.Track_Number}, MP ${pin.MP}`);
          doc.text(`   GPS: ${pin.Latitude.toFixed(6)}, ${pin.Longitude.toFixed(6)}`);
          if (pin.Notes) {
            doc.text(`   Notes: ${pin.Notes}`);
          }
          doc.text(`   Time: ${new Date(pin.Created_At).toLocaleString()}`);
        });
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text('Sidekick Awareness Platform', { align: 'center' });

      // Finalize PDF
      doc.end();

      logger.info(`PDF trip report generated for authority ${authorityId}`);
    } catch (error) {
      logger.error('Generate PDF report error:', error);
      res.status(500).json({ error: 'Failed to generate PDF report' });
    }
  }

  /**
   * Get trip report data
   * GET /api/trip-reports/:authorityId
   */
  async getTripReport(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;

      const pool = await poolPromise;

      // Get authority details
      const authorityResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .input('userId', sql.Int, user.User_ID)
        .query(`
          SELECT a.*, 
                 s.Subdivision_Name,
                 ag.Agency_Name
          FROM Authorities a
          LEFT JOIN Subdivisions s ON a.Subdivision_ID = s.Subdivision_ID
          LEFT JOIN Agencies ag ON a.Agency_ID = ag.Agency_ID
          WHERE a.Authority_ID = @authorityId
            AND a.User_ID = @userId
        `);

      if (authorityResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Authority not found' });
      }

      const authority = authorityResult.recordset[0];

      // Get pins
      const pinsResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .query(`
          SELECT p.*,
                 pt.Pin_Category,
                 pt.Pin_Subtype,
                 pt.Color,
                 pt.Photo_Export_Mode
          FROM Pins p
          LEFT JOIN Pin_Types pt ON p.Pin_Type_ID = pt.Pin_Type_ID
          WHERE p.Authority_ID = @authorityId
          ORDER BY p.Created_At
        `);

      const pins = pinsResult.recordset;

      // Get GPS logs summary
      const gpsResult = await pool.request()
        .input('authorityId', sql.Int, authorityId)
        .query(`
          SELECT 
            COUNT(*) as TotalLogs,
            MIN(Created_At) as FirstLog,
            MAX(Created_At) as LastLog
          FROM GPS_Logs
          WHERE Authority_ID = @authorityId
        `);

      const gpsSummary = gpsResult.recordset[0];

      res.json({
        authority,
        pins,
        gpsSummary,
        summary: {
          totalPins: pins.length,
          totalGPSLogs: gpsSummary.TotalLogs,
          startTime: authority.Created_At,
          endTime: authority.End_Time,
        },
      });
    } catch (error) {
      logger.error('Get trip report error:', error);
      res.status(500).json({ error: 'Failed to get trip report' });
    }
  }
}

module.exports = new TripReportController();

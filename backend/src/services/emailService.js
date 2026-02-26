// backend/src/services/emailService.js
const nodemailer = require('nodemailer');
const { logger } = require('../config/logger');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initializeTransporter();
    this.loadTemplates();
  }

  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      logger.info('Email transporter initialized');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  loadTemplates() {
    const templateDir = path.join(__dirname, '../templates/email');
    
    if (fs.existsSync(templateDir)) {
      const templateFiles = fs.readdirSync(templateDir);
      
      templateFiles.forEach(file => {
        if (file.endsWith('.hbs')) {
          const templateName = path.basename(file, '.hbs');
          const templatePath = path.join(templateDir, file);
          const templateContent = fs.readFileSync(templatePath, 'utf8');
          this.templates.set(templateName, handlebars.compile(templateContent));
          logger.info(`Loaded email template: ${templateName}`);
        }
      });
    }
  }

  async sendTripReportEmail(reportData, recipients) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const { authority, user, agency } = reportData;

      // Generate HTML content
      const htmlContent = this.generateTripReportHTML(reportData);

      // Prepare email
      const mailOptions = {
        from: `"Sidekick" <${process.env.SMTP_USER}>`,
        to: recipients,
        subject: `Trip Report: ${agency?.Agency_Name || 'Rail Authority'} - ${formatDate(new Date())}`,
        html: htmlContent,
        attachments: this.generateAttachments(reportData),
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Trip report email sent: ${info.messageId}`);
      
      // Log email send in database
      await this.logEmailSend({
        type: 'trip_report',
        authorityId: authority.Authority_ID,
        userId: user.User_ID,
        recipients: recipients.join(', '),
        messageId: info.messageId,
      });

      return info;
    } catch (error) {
      logger.error('Failed to send trip report email:', error);
      throw error;
    }
  }

  generateTripReportHTML(reportData) {
    const { authority, pins, user, agency, trip } = reportData;
    
    const template = this.templates.get('trip-report') || this.getDefaultTripReportTemplate();
    
    const context = {
      agencyName: agency?.Agency_Name || 'Rail Authority',
      agencyLogo: agency?.Logo_URL || '',
      reportDate: formatDate(new Date()),
      employeeName: authority.Employee_Name_Display || user.Employee_Name,
      employeeContact: authority.Employee_Contact_Display || user.Employee_Contact,
      subdivision: authority.Subdivision_Name,
      trackInfo: `${authority.Track_Type} ${authority.Track_Number}`,
      authorityRange: `MP ${authority.Begin_MP} to ${authority.End_MP}`,
      startTime: formatDateTime(authority.Start_Time),
      endTime: formatDateTime(authority.End_Tracking_Time || new Date()),
      duration: calculateDuration(authority.Start_Time, authority.End_Tracking_Time || new Date()),
      totalPins: pins.length,
      pins: pins.map((pin, index) => {
        const photoLinks = this.extractPhotoUrls(pin);
        const photoLinksText = photoLinks.length
          ? `\nPhotos: ${photoLinks.join(' , ')}`
          : '';
        return {
          photoLinks,
        number: index + 1,
        type: pin.Pin_Subtype || 'General',
        location: pin.MP ? `MP ${pin.MP}` : 'No MP',
        coordinates: `${pin.Latitude?.toFixed(6)}, ${pin.Longitude?.toFixed(6)}`,
        notes: `${pin.Notes || ''}${photoLinksText}`,
        time: formatDateTime(pin.Created_Date),
        };
      }),
      summary: trip?.Trip_Notes || 'No summary provided',
      safetyNotes: this.generateSafetyNotes(pins),
    };

    return template(context);
  }

  getDefaultTripReportTemplate() {
    return handlebars.compile(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: #000; color: #FFD100; padding: 20px; text-align: center; }
          .content { padding: 30px; }
          .section { margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          .section-title { color: #FFD100; font-size: 20px; margin-bottom: 15px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .info-table th { background: #f5f5f5; text-align: left; padding: 10px; border: 1px solid #ddd; }
          .info-table td { padding: 10px; border: 1px solid #ddd; }
          .pins-table { width: 100%; border-collapse: collapse; }
          .pins-table th { background: #FFD100; color: #000; text-align: left; padding: 10px; }
          .pins-table td { padding: 10px; border: 1px solid #ddd; }
          .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .safety-alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>{{agencyName}} Trip Report</h1>
          <p>Generated: {{reportDate}}</p>
        </div>
        
        <div class="content">
          <div class="section">
            <h2 class="section-title">Authority Information</h2>
            <table class="info-table">
              <tr><th>Employee:</th><td>{{employeeName}} ({{employeeContact}})</td></tr>
              <tr><th>Subdivision:</th><td>{{subdivision}}</td></tr>
              <tr><th>Track:</th><td>{{trackInfo}}</td></tr>
              <tr><th>Authority Range:</th><td>{{authorityRange}}</td></tr>
              <tr><th>Start Time:</th><td>{{startTime}}</td></tr>
              <tr><th>End Time:</th><td>{{endTime}}</td></tr>
              <tr><th>Duration:</th><td>{{duration}}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <h2 class="section-title">Pin Drops ({{totalPins}} total)</h2>
            {{#if pins.length}}
            <table class="pins-table">
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Location</th><th>Coordinates</th><th>Time</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {{#each pins}}
                <tr>
                  <td>{{this.number}}</td>
                  <td>{{this.type}}</td>
                  <td>{{this.location}}</td>
                  <td>{{this.coordinates}}</td>
                  <td>{{this.time}}</td>
                  <td>{{this.notes}}</td>
                </tr>
                {{/each}}
              </tbody>
            </table>
            {{else}}
            <p>No pin drops recorded during this trip.</p>
            {{/if}}
          </div>
          
          <div class="section">
            <h2 class="section-title">Trip Summary</h2>
            <p>{{summary}}</p>
          </div>
          
          {{#if safetyNotes}}
          <div class="safety-alert">
            <h3>⚠️ Safety Notes</h3>
            <p>{{safetyNotes}}</p>
          </div>
          {{/if}}
        </div>
        
        <div class="footer">
          <p>This report was automatically generated by Sidekick System.</p>
          <p>For questions or concerns, contact your system administrator.</p>
        </div>
      </body>
      </html>
    `);
  }

  generateAttachments(reportData) {
    const attachments = [];
    
    // Add report as PDF if available
    if (reportData.pdfPath && fs.existsSync(reportData.pdfPath)) {
      attachments.push({
        filename: `trip-report-${reportData.authority.Authority_ID}.pdf`,
        path: reportData.pdfPath,
        contentType: 'application/pdf',
      });
    }
    
    // Add photos from pin drops
    if (reportData.pins) {
      reportData.pins.forEach((pin, index) => {
        const photoUrls = this.extractPhotoUrls(pin);
        const shouldAttach = (pin.Photo_Export_Mode || 'links') === 'attachments';
        if (!shouldAttach) {
          return;
        }

        photoUrls.forEach((photoUrl, photoIndex) => {
          if (photoUrl && fs.existsSync(photoUrl)) {
            attachments.push({
              filename: `pin-${index + 1}-${photoIndex + 1}.jpg`,
              path: photoUrl,
              contentType: 'image/jpeg',
            });
          }
        });
      });
    }
    
    return attachments;
  }

  extractPhotoUrls(pin) {
    const urls = [];

    if (pin.Photo_URL) {
      urls.push(pin.Photo_URL);
    }

    if (pin.Photo_URLs) {
      try {
        const parsed = JSON.parse(pin.Photo_URLs);
        if (Array.isArray(parsed)) {
          parsed.forEach((url) => {
            if (url && !urls.includes(url)) {
              urls.push(url);
            }
          });
        }
      } catch (error) {
        // Ignore invalid JSON and keep fallback Photo_URL
      }
    }

    return urls;
  }

  generateSafetyNotes(pins) {
    const scrapPins = pins.filter((pin) => {
      return (
        pin.Pin_Subtype?.includes('Scrap') || pin.Pin_Subtype?.includes('Hazard')
      );
    });

    if (scrapPins.length === 0) {
      return '';
    }

    let notes = 'This trip included the following safety-related pin drops:\n';
    scrapPins.forEach((pin, index) => {
      notes += `${index + 1}. ${pin.Pin_Subtype} at MP ${pin.MP || 'unknown location'}`;
      if (pin.Notes) {
        notes += ` - ${pin.Notes}`;
      }
      notes += '\n';
    });

    return notes;
  }

  async logEmailSend(emailData) {
    try {
      const query = `
        INSERT INTO Email_Logs 
        (Email_Type, Authority_ID, User_ID, Recipients, Message_ID, Status, Sent_Time)
        VALUES (@Email_Type, @Authority_ID, @User_ID, @Recipients, @Message_ID, 'sent', GETDATE())
      `;

      const request = new db.Request();
      request.input('Email_Type', db.VarChar, emailData.type);
      request.input('Authority_ID', db.Int, emailData.authorityId);
      request.input('User_ID', db.Int, emailData.userId);
      request.input('Recipients', db.NVarChar, emailData.recipients);
      request.input('Message_ID', db.VarChar, emailData.messageId);

      await request.query(query);
    } catch (error) {
      logger.error('Failed to log email send:', error);
    }
  }

  async sendSystemNotification(recipients, subject, message, options = {}) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `"Sidekick System" <${process.env.SMTP_USER}>`,
        to: Array.isArray(recipients) ? recipients : [recipients],
        subject: subject,
        html: options.html || this.formatPlainTextAsHTML(message),
        attachments: options.attachments || [],
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`System notification email sent: ${subject}`);
      return info;
    } catch (error) {
      logger.error('Failed to send system notification:', error);
      throw error;
    }
  }

  formatPlainTextAsHTML(text) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .content { padding: 20px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="content">
          ${text.replace(/\n/g, '<br>')}
        </div>
        <div class="footer">
          <p>This is an automated message from Sidekick System.</p>
        </div>
      </body>
      </html>
    `;
  }

  async getEmailTemplates() {
    const templates = [];
    this.templates.forEach((template, name) => {
      templates.push({
        name,
        subject: this.getTemplateSubject(name),
        description: this.getTemplateDescription(name),
      });
    });
    return templates;
  }

  getTemplateSubject(templateName) {
    const subjects = {
      'trip-report': 'Trip Report - {{agencyName}}',
      'alert-summary': 'Daily Alert Summary - {{date}}',
      'system-notification': 'System Notification',
    };
    return subjects[templateName] || 'Notification';
  }

  getTemplateDescription(templateName) {
    const descriptions = {
      'trip-report': 'Trip report with authority details and pin drops',
      'alert-summary': 'Daily summary of system alerts',
      'system-notification': 'General system notification',
    };
    return descriptions[templateName] || 'Email template';
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email connection successful' };
    } catch (error) {
      return { success: false, message: `Email connection failed: ${error.message}` };
    }
  }

  /**
   * Send authority overlap notification email
   */
  async sendAuthorityOverlapEmail(overlapData, adminEmails) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const {
        newAuthority,
        conflictingAuthorities,
        user,
        agency
      } = overlapData;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #C70039; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; }
            .alert-box { background: #fff3cd; border: 2px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .conflict-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .conflict-table th { background: #f5f5f5; text-align: left; padding: 10px; border: 1px solid #ddd; }
            .conflict-table td { padding: 10px; border: 1px solid #ddd; }
            .warning { color: #C70039; font-weight: bold; }
            .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>⚠️ Authority Overlap Detected</h1>
            <p>${agency?.Agency_Name || 'Rail Authority System'}</p>
          </div>
          
          <div class="content">
            <div class="alert-box">
              <h2 class="warning">New Authority Conflicts with Existing Authorities</h2>
              <p>A new authority has been created that overlaps with ${conflictingAuthorities.length} existing ${conflictingAuthorities.length === 1 ? 'authority' : 'authorities'}.</p>
            </div>
            
            <h3>New Authority Details:</h3>
            <table class="conflict-table">
              <tr><th>Employee:</th><td>${newAuthority.Employee_Name_Display || user.Employee_Name}</td></tr>
              <tr><th>Contact:</th><td>${newAuthority.Employee_Contact_Display || user.Employee_Contact}</td></tr>
              <tr><th>Subdivision:</th><td>${newAuthority.Subdivision_Code}</td></tr>
              <tr><th>Track:</th><td>${newAuthority.Track_Type} ${newAuthority.Track_Number}</td></tr>
              <tr><th>Range:</th><td>MP ${newAuthority.Begin_MP} to ${newAuthority.End_MP}</td></tr>
              <tr><th>Start Time:</th><td>${formatDateTime(newAuthority.Start_Time)}</td></tr>
            </table>
            
            <h3>Conflicting ${conflictingAuthorities.length === 1 ? 'Authority' : 'Authorities'}:</h3>
            <table class="conflict-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Contact</th>
                  <th>Track</th>
                  <th>Range</th>
                  <th>Start Time</th>
                </tr>
              </thead>
              <tbody>
                ${conflictingAuthorities.map(auth => `
                  <tr>
                    <td>${auth.Employee_Name_Display}</td>
                    <td>${auth.Employee_Contact_Display}</td>
                    <td>${auth.Track_Type} ${auth.Track_Number}</td>
                    <td>MP ${auth.Begin_MP} to ${auth.End_MP}</td>
                    <td>${formatDateTime(auth.Start_Time)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="alert-box">
              <h3>⚠️ Action Required</h3>
              <p>Please coordinate with all workers to ensure safe operations. Workers have been notified of the overlap.</p>
              <p><strong>Recommendation:</strong> Contact all parties to confirm work coordination and safety protocols.</p>
            </div>
          </div>
          
          <div class="footer">
            <p>This alert was automatically generated by Sidekick System.</p>
            <p>Generated: ${formatDateTime(new Date())}</p>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"Sidekick System" <${process.env.SMTP_USER}>`,
        to: adminEmails,
        subject: `⚠️ Authority Overlap Alert - ${newAuthority.Subdivision_Code} ${newAuthority.Track_Type} ${newAuthority.Track_Number}`,
        html: htmlContent,
        priority: 'high'
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Authority overlap email sent to admins: ${info.messageId}`);

      // Log email
      await this.logEmailSend({
        type: 'authority_overlap',
        authorityId: newAuthority.Authority_ID,
        userId: user.User_ID,
        recipients: adminEmails.join(', '),
        messageId: info.messageId
      });

      return info;
    } catch (error) {
      logger.error('Failed to send authority overlap email:', error);
      throw error;
    }
  }

  /**
   * Send daily alert summary email
   */
  async sendAlertSummaryEmail(summaryData, recipients) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const {
        date,
        agency,
        proximityAlerts,
        boundaryAlerts,
        authorityOverlaps,
        totalAlerts
      } = summaryData;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #000; color: #FFD100; padding: 20px; text-align: center; }
            .content { padding: 30px; }
            .summary-box { background: #f8f9fa; border-left: 4px solid #FFD100; padding: 20px; margin: 20px 0; }
            .stats { display: flex; justify-content: space-around; margin: 30px 0; }
            .stat-card { text-align: center; padding: 20px; background: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stat-number { font-size: 36px; font-weight: bold; color: #FFD100; }
            .stat-label { color: #666; margin-top: 10px; }
            .alert-section { margin: 30px 0; }
            .alert-section h3 { color: #FFD100; border-bottom: 2px solid #FFD100; padding-bottom: 10px; }
            .alert-list { list-style: none; padding: 0; }
            .alert-item { padding: 15px; margin: 10px 0; background: #fff; border-left: 4px solid #3498DB; border-radius: 3px; }
            .alert-item.critical { border-left-color: #C70039; }
            .alert-item.warning { border-left-color: #FFC300; }
            .alert-time { color: #666; font-size: 12px; }
            .footer { background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${agency?.Agency_Name || 'Rail Authority'} Daily Alert Summary</h1>
            <p>${formatDate(new Date(date))}</p>
          </div>
          
          <div class="content">
            <div class="summary-box">
              <h2>Daily Overview</h2>
              <p><strong>Total Alerts:</strong> ${totalAlerts}</p>
              <p>This summary includes all proximity alerts, boundary warnings, and authority overlaps detected in the past 24 hours.</p>
            </div>
            
            <div class="stats">
              <div class="stat-card">
                <div class="stat-number">${proximityAlerts?.length || 0}</div>
                <div class="stat-label">Proximity Alerts</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${boundaryAlerts?.length || 0}</div>
                <div class="stat-label">Boundary Alerts</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${authorityOverlaps?.length || 0}</div>
                <div class="stat-label">Authority Overlaps</div>
              </div>
            </div>
            
            ${proximityAlerts && proximityAlerts.length > 0 ? `
              <div class="alert-section">
                <h3>Proximity Alerts</h3>
                <ul class="alert-list">
                  ${proximityAlerts.map(alert => `
                    <li class="alert-item ${alert.Alert_Level?.toLowerCase()}">
                      <strong>${alert.Message}</strong>
                      <div class="alert-time">${formatDateTime(alert.Alert_Time)} - ${alert.Alert_Level}</div>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${boundaryAlerts && boundaryAlerts.length > 0 ? `
              <div class="alert-section">
                <h3>Boundary Alerts</h3>
                <ul class="alert-list">
                  ${boundaryAlerts.map(alert => `
                    <li class="alert-item ${alert.Alert_Level?.toLowerCase()}">
                      <strong>${alert.Message}</strong>
                      <div class="alert-time">${formatDateTime(alert.Alert_Time)} - ${alert.Alert_Level}</div>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${authorityOverlaps && authorityOverlaps.length > 0 ? `
              <div class="alert-section">
                <h3>Authority Overlaps</h3>
                <ul class="alert-list">
                  ${authorityOverlaps.map(overlap => `
                    <li class="alert-item critical">
                      <strong>Overlap detected: ${overlap.Subdivision_Code} ${overlap.Track_Type} ${overlap.Track_Number}</strong>
                      <div>Workers: ${overlap.Workers?.join(', ')}</div>
                      <div class="alert-time">${formatDateTime(overlap.Start_Time)}</div>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${totalAlerts === 0 ? `
              <div class="summary-box">
                <p>✅ No alerts were triggered during this period. All operations proceeded normally.</p>
              </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>This is an automated daily summary from Sidekick System.</p>
            <p>Generated: ${formatDateTime(new Date())}</p>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: `"Sidekick System" <${process.env.SMTP_USER}>`,
        to: Array.isArray(recipients) ? recipients : [recipients],
        subject: `Daily Alert Summary - ${formatDate(new Date(date))} - ${agency?.Agency_Name || 'Rail Authority'}`,
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Alert summary email sent: ${info.messageId}`);

      return info;
    } catch (error) {
      logger.error('Failed to send alert summary email:', error);
      throw error;
    }
  }
}

// Helper functions
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calculateDuration(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

module.exports = new EmailService();

const Authority = require('../models/Authority');
const { logger } = require('../config/logger');
const { getSocketIO } = require('../config/socket');
const emailService = require('../services/emailService');
const sql = require('mssql');
const { poolPromise } = require('../config/database');
const {
  getFieldConfigurations,
  getOverlapAlertConfig,
  getNotificationPolicyConfig,
} = require('../services/agencyConfigService');
const firebaseService = require('../services/firebaseService');
const { logAuditEvent } = require('../services/auditEventService');
const { canAccessAgency, isGlobalAdmin } = require('../utils/rbac');

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const toMinutes = (timeStr) => {
  const [h, m] = String(timeStr || '00:00').split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

const isWithinWindow = (nowMinutes, startMinutes, endMinutes) => {
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
};

const buildNotificationPolicy = (agencyId, level) => {
  const cfg = getNotificationPolicyConfig(agencyId);
  const normalizedLevel = String(level || 'critical').toLowerCase();
  const base = {
    enabled: cfg.enabled,
    pushEnabled: cfg.pushEnabled,
    visualEnabled: cfg.visualEnabled,
    vibrationEnabled: cfg.vibrationEnabled,
    audioEnabled: cfg.audioEnabled,
    suppressedBy: null,
  };

  if (!cfg.enabled) {
    return { ...base, pushEnabled: false, visualEnabled: false, vibrationEnabled: false, audioEnabled: false, suppressedBy: 'disabled' };
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (cfg.quietHours.enabled) {
    const start = toMinutes(cfg.quietHours.start);
    const end = toMinutes(cfg.quietHours.end);
    if (isWithinWindow(nowMinutes, start, end) && cfg.quietHours.suppressLevels.includes(normalizedLevel)) {
      return { ...base, pushEnabled: false, visualEnabled: false, vibrationEnabled: false, audioEnabled: false, suppressedBy: 'quietHours' };
    }
  }

  if (cfg.shiftRules.enabled) {
    const start = toMinutes(cfg.shiftRules.start);
    const end = toMinutes(cfg.shiftRules.end);
    if (!isWithinWindow(nowMinutes, start, end) && cfg.shiftRules.suppressOutsideShiftLevels.includes(normalizedLevel)) {
      return { ...base, pushEnabled: false, visualEnabled: false, vibrationEnabled: false, audioEnabled: false, suppressedBy: 'shiftRules' };
    }
  }

  return base;
};

class AuthorityController {
  async createAuthority(req, res) {
    try {
      const user = req.user;
      const authorityData = req.body;
      const fieldConfigurations = getFieldConfigurations(user.Agency_ID);

      const validationErrors = [];
      const normalizedAuthorityData = { ...authorityData };

      const isFieldEnabled = (fieldKey) => fieldConfigurations?.[fieldKey]?.enabled !== false;
      const isFieldRequired = (fieldKey) => Boolean(fieldConfigurations?.[fieldKey]?.required);
      const fieldLabel = (fieldKey, fallback) => fieldConfigurations?.[fieldKey]?.label || fallback;

      if (isBlank(normalizedAuthorityData.authorityType)) {
        validationErrors.push({ field: 'authorityType', message: 'Authority type is required' });
      }

      if (isFieldEnabled('subdivision')) {
        if (isFieldRequired('subdivision') && isBlank(normalizedAuthorityData.subdivisionId)) {
          validationErrors.push({
            field: 'subdivisionId',
            message: `${fieldLabel('subdivision', 'Subdivision')} is required`,
          });
        }
      } else {
        delete normalizedAuthorityData.subdivisionId;
      }

      if (isFieldEnabled('beginMP')) {
        if (isFieldRequired('beginMP') && isBlank(normalizedAuthorityData.beginMP)) {
          validationErrors.push({
            field: 'beginMP',
            message: `${fieldLabel('beginMP', 'Begin MP')} is required`,
          });
        }

        const beginMP = Number.parseFloat(normalizedAuthorityData.beginMP);
        if (!Number.isNaN(beginMP)) {
          normalizedAuthorityData.beginMP = beginMP;
        } else if (!isBlank(normalizedAuthorityData.beginMP)) {
          validationErrors.push({
            field: 'beginMP',
            message: `${fieldLabel('beginMP', 'Begin MP')} must be numeric`,
          });
        }
      } else {
        delete normalizedAuthorityData.beginMP;
      }

      if (isFieldEnabled('endMP')) {
        if (isFieldRequired('endMP') && isBlank(normalizedAuthorityData.endMP)) {
          validationErrors.push({
            field: 'endMP',
            message: `${fieldLabel('endMP', 'End MP')} is required`,
          });
        }

        const endMP = Number.parseFloat(normalizedAuthorityData.endMP);
        if (!Number.isNaN(endMP)) {
          normalizedAuthorityData.endMP = endMP;
        } else if (!isBlank(normalizedAuthorityData.endMP)) {
          validationErrors.push({
            field: 'endMP',
            message: `${fieldLabel('endMP', 'End MP')} must be numeric`,
          });
        }
      } else {
        delete normalizedAuthorityData.endMP;
      }

      if (
        isFieldEnabled('beginMP') &&
        isFieldEnabled('endMP') &&
        Number.isFinite(normalizedAuthorityData.beginMP) &&
        Number.isFinite(normalizedAuthorityData.endMP) &&
        normalizedAuthorityData.endMP < normalizedAuthorityData.beginMP
      ) {
        validationErrors.push({
          field: 'endMP',
          message: `${fieldLabel('endMP', 'End MP')} must be greater than or equal to ${fieldLabel('beginMP', 'Begin MP')}`,
        });
      }

      if (isFieldEnabled('trackType')) {
        if (isFieldRequired('trackType') && isBlank(normalizedAuthorityData.trackType)) {
          validationErrors.push({
            field: 'trackType',
            message: `${fieldLabel('trackType', 'Track Type')} is required`,
          });
        }
        const configuredTrackTypes = Array.isArray(fieldConfigurations?.trackType?.options)
          ? fieldConfigurations.trackType.options.map((opt) => String(opt).trim()).filter(Boolean)
          : [];
        if (
          configuredTrackTypes.length > 0 &&
          !isBlank(normalizedAuthorityData.trackType) &&
          !configuredTrackTypes.includes(String(normalizedAuthorityData.trackType).trim())
        ) {
          validationErrors.push({
            field: 'trackType',
            message: `${fieldLabel('trackType', 'Track Type')} is not allowed`,
          });
        }
      } else {
        delete normalizedAuthorityData.trackType;
      }

      if (isFieldEnabled('trackNumber')) {
        if (isFieldRequired('trackNumber') && isBlank(normalizedAuthorityData.trackNumber)) {
          validationErrors.push({
            field: 'trackNumber',
            message: `${fieldLabel('trackNumber', 'Track Number')} is required`,
          });
        }
      } else {
        delete normalizedAuthorityData.trackNumber;
      }

      if (!isFieldEnabled('employeeName')) {
        delete normalizedAuthorityData.employeeNameDisplay;
      }
      if (!isFieldEnabled('employeeContact')) {
        delete normalizedAuthorityData.employeeContactDisplay;
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors,
        });
      }

      // Normalize optional expiration to prevent invalid null/empty values reaching the model.
      if (normalizedAuthorityData.expirationTime === null || normalizedAuthorityData.expirationTime === '') {
        delete normalizedAuthorityData.expirationTime;
      }
      
      // Add user ID to authority data
      normalizedAuthorityData.userId = user.User_ID;
      
      // Use employee name and contact from user if not provided
      if (!normalizedAuthorityData.employeeNameDisplay) {
        normalizedAuthorityData.employeeNameDisplay = user.Employee_Name;
      }
      if (!normalizedAuthorityData.employeeContactDisplay) {
        normalizedAuthorityData.employeeContactDisplay = user.Employee_Contact;
      }
      
      const result = await Authority.create(normalizedAuthorityData);
      
      // Log authority creation
      logger.info(`Authority created: ID ${result.authorityId} by user ${user.User_ID} (${user.Employee_Name})`);
      await logAuditEvent({
        userId: user.User_ID,
        actionType: 'AUTHORITY_START',
        tableName: 'Authorities',
        recordId: result.authorityId,
        newValue: {
          subdivisionId: normalizedAuthorityData.subdivisionId,
          beginMP: normalizedAuthorityData.beginMP,
          endMP: normalizedAuthorityData.endMP,
          trackType: normalizedAuthorityData.trackType,
          trackNumber: normalizedAuthorityData.trackNumber,
        },
        ipAddress: req.ip,
        deviceInfo: req.get('User-Agent'),
      });
      
      // If overlap detected, send real-time alerts and email notifications
      if (result.hasOverlap && result.overlapDetails.length > 0) {
        const overlapAlertConfig = getOverlapAlertConfig(user.Agency_ID);
        const notificationPolicy = buildNotificationPolicy(user.Agency_ID, 'critical');

        const maskOverlapCounterparty = (name, phone) => ({
          employeeName: overlapAlertConfig.showEmployeeName ? name : 'Hidden by admin policy',
          employeeContact: overlapAlertConfig.showEmployeePhone ? phone : null,
        });

        for (const overlap of result.overlapDetails) {
          // Send socket alert to both users
          const socket = getSocketIO();

          const overlapRangeBegin = Math.max(
            Number(normalizedAuthorityData.beginMP),
            Number(overlap.Begin_MP)
          );
          const overlapRangeEnd = Math.min(
            Number(normalizedAuthorityData.endMP),
            Number(overlap.End_MP)
          );
          const overlapRange = {
            beginMP: overlapRangeBegin,
            endMP: overlapRangeEnd,
          };

          const newAuthorityDisplay = maskOverlapCounterparty(
            normalizedAuthorityData.employeeNameDisplay,
            normalizedAuthorityData.employeeContactDisplay
          );
          const existingAuthorityDisplay = maskOverlapCounterparty(
            overlap.Employee_Name_Display,
            overlap.Employee_Contact_Display
          );
          
          if (notificationPolicy.visualEnabled) {
            // Alert to overlapping authority user
            socket.to(`user-${overlap.User_ID}`).emit('authority_overlap', {
              type: 'OVERLAP_DETECTED',
              message: `Authority overlap detected with ${newAuthorityDisplay.employeeName}`,
              details: {
                yourAuthority: {
                  beginMP: overlap.Begin_MP,
                  endMP: overlap.End_MP
                },
                overlappingAuthority: {
                  employeeName: newAuthorityDisplay.employeeName,
                  employeeContact: newAuthorityDisplay.employeeContact,
                  beginMP: normalizedAuthorityData.beginMP,
                  endMP: normalizedAuthorityData.endMP
                },
                overlapRange: overlapAlertConfig.highlightOverlapRange ? overlapRange : null,
                notificationPolicy,
              },
              timestamp: new Date()
            });
            
            // Alert to new authority user
            socket.to(`user-${user.User_ID}`).emit('authority_overlap', {
              type: 'OVERLAP_DETECTED',
              message: `Authority overlap detected with ${existingAuthorityDisplay.employeeName}`,
              details: {
                yourAuthority: {
                  beginMP: normalizedAuthorityData.beginMP,
                  endMP: normalizedAuthorityData.endMP
                },
                overlappingAuthority: {
                  employeeName: existingAuthorityDisplay.employeeName,
                  employeeContact: existingAuthorityDisplay.employeeContact,
                  beginMP: overlap.Begin_MP,
                  endMP: overlap.End_MP
                },
                overlapRange: overlapAlertConfig.highlightOverlapRange ? overlapRange : null,
                notificationPolicy,
              },
              timestamp: new Date()
            });
          }

          if (notificationPolicy.pushEnabled) {
            await firebaseService.sendAuthorityOverlapAlert(
              {
                Authority_ID: result.authorityId,
                User_ID: user.User_ID,
              },
              {
                Authority_ID: overlap.Authority_ID,
                Employee_Name_Display: existingAuthorityDisplay.employeeName,
                Employee_Contact_Display: existingAuthorityDisplay.employeeContact,
                Begin_MP: overlapRange.beginMP,
                End_MP: overlapRange.endMP,
                Track_Type: normalizedAuthorityData.trackType,
                Track_Number: normalizedAuthorityData.trackNumber,
                notificationPolicy,
              }
            );

            await firebaseService.sendAuthorityOverlapAlert(
              {
                Authority_ID: overlap.Authority_ID,
                User_ID: overlap.User_ID,
              },
              {
                Authority_ID: result.authorityId,
                Employee_Name_Display: newAuthorityDisplay.employeeName,
                Employee_Contact_Display: newAuthorityDisplay.employeeContact,
                Begin_MP: overlapRange.beginMP,
                End_MP: overlapRange.endMP,
                Track_Type: normalizedAuthorityData.trackType,
                Track_Number: normalizedAuthorityData.trackNumber,
                notificationPolicy,
              }
            );
          }
        }

        // Send email notification to supervisors/admins
        try {
          const pool = await poolPromise;
          
          // Get agency details
          const agencyResult = await pool.request()
            .input('agencyId', sql.Int, user.Agency_ID)
            .query('SELECT * FROM Agencies WHERE Agency_ID = @agencyId');
          
          const agency = agencyResult.recordset[0];
          
          // Get supervisor/admin emails
          const emailsResult = await pool.request()
            .input('agencyId', sql.Int, user.Agency_ID)
            .query(`
              SELECT Email 
              FROM Users 
              WHERE Agency_ID = @agencyId 
                AND Role IN ('Administrator', 'Supervisor')
                AND Email IS NOT NULL
                AND Active = 1
            `);
          
          const adminEmails = emailsResult.recordset.map(r => r.Email);
          
          if (adminEmails.length > 0) {
            // Get full authority details for email
            const newAuthorityResult = await pool.request()
              .input('authorityId', sql.Int, result.authorityId)
              .query('SELECT * FROM Authorities WHERE Authority_ID = @authorityId');
            
            const newAuthority = newAuthorityResult.recordset[0];
            
            await emailService.sendAuthorityOverlapEmail({
              newAuthority,
              conflictingAuthorities: result.overlapDetails,
              user,
              agency
            }, adminEmails);
            
            logger.info(`Overlap email sent for authority ${result.authorityId}`);
          }
        } catch (emailError) {
          // Log email error but don't fail the authority creation
          logger.error('Failed to send overlap email:', emailError);
        }
      }
      
      res.status(201).json({
        success: true,
        data: (() => {
          const overlapAlertConfig = getOverlapAlertConfig(user.Agency_ID);
          const overlapDetails = Array.isArray(result.overlapDetails)
            ? result.overlapDetails.map((overlap) => {
                const overlapRangeBegin = Math.max(
                  Number(normalizedAuthorityData.beginMP),
                  Number(overlap.Begin_MP)
                );
                const overlapRangeEnd = Math.min(
                  Number(normalizedAuthorityData.endMP),
                  Number(overlap.End_MP)
                );

                return {
                  ...overlap,
                  Employee_Name_Display: overlapAlertConfig.showEmployeeName
                    ? overlap.Employee_Name_Display
                    : 'Hidden by admin policy',
                  Employee_Contact_Display: overlapAlertConfig.showEmployeePhone
                    ? overlap.Employee_Contact_Display
                    : null,
                  Overlap_Begin_MP: overlapRangeBegin,
                  Overlap_End_MP: overlapRangeEnd,
                };
              })
            : [];

          return {
            ...result,
            overlapDetails,
          };
        })(),
        message: result.hasOverlap ? 
          'Authority created with overlap warnings' : 
          'Authority created successfully'
      });
    } catch (error) {
      logger.error('Create authority error:', error);

      const errorMessage = String(error?.message || '');
      if (error?.number === 547 && errorMessage.includes('Authority_Type')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid authority type for current database configuration'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create authority',
        ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
      });
    }
  }
  
  async getActiveAuthorities(req, res) {
    try {
      const user = req.user;
      const { subdivisionId, trackType, trackNumber } = req.query;
      
      let authorities;
      
      // Administrators and supervisors can see all active authorities
      if (user.Role === 'Administrator' || user.Role === 'Supervisor') {
        const scopedAgencyId = isGlobalAdmin(user) ? null : Number(user.Agency_ID);
        authorities = await Authority.getActiveAuthorities(
          subdivisionId ? parseInt(subdivisionId) : null,
          trackType,
          trackNumber,
          scopedAgencyId
        );
      } else {
        // Field workers can only see their own active authorities
        authorities = await Authority.getUserAuthorities(user.User_ID, true);
      }
      
      res.json({
        success: true,
        data: {
          authorities,
          count: authorities.length
        }
      });
    } catch (error) {
      logger.error('Get active authorities error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get active authorities'
      });
    }
  }
  
  async getAuthorityById(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;
      
      const authority = await Authority.getAuthorityById(authorityId);
      
      if (!authority) {
        return res.status(404).json({
          success: false,
          error: 'Authority not found'
        });
      }
      
      // Check if user has permission to view this authority
      const canView = await this.canViewAuthority(user, authority);
      
      if (!canView) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this authority'
        });
      }
      
      res.json({
        success: true,
        data: { authority }
      });
    } catch (error) {
      logger.error('Get authority error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get authority'
      });
    }
  }
  
  async endAuthority(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;
      const { confirmEndTracking = true } = req.body;
      
      // Check if authority exists and belongs to user
      const authority = await Authority.getAuthorityById(authorityId);
      
      if (!authority) {
        return res.status(404).json({
          success: false,
          error: 'Authority not found'
        });
      }
      
      const isAuthorityOwner = Number(authority.User_ID) === Number(user.User_ID);
      const canAdminEnd = user.Role === 'Administrator' && canAccessAgency(user, Number(authority.Agency_ID));
      if (!isAuthorityOwner && !canAdminEnd) {
        return res.status(403).json({
          success: false,
          error: 'You can only end your own authorities'
        });
      }
      
      if (!authority.Is_Active) {
        return res.status(400).json({
          success: false,
          error: 'Authority is already ended'
        });
      }
      
      const endedAuthority = await Authority.endAuthority(
        authorityId, 
        user.User_ID, 
        confirmEndTracking
      );
      
      logger.info(`Authority ended: ID ${authorityId} by user ${user.User_ID} (${user.Employee_Name})`);
      await logAuditEvent({
        userId: user.User_ID,
        actionType: 'AUTHORITY_END',
        tableName: 'Authorities',
        recordId: Number(authorityId),
        oldValue: {
          isActive: authority.Is_Active,
          beginMP: authority.Begin_MP,
          endMP: authority.End_MP,
          trackType: authority.Track_Type,
          trackNumber: authority.Track_Number,
        },
        newValue: {
          isActive: false,
          endedBy: user.User_ID,
        },
        ipAddress: req.ip,
        deviceInfo: req.get('User-Agent'),
      });
      
      res.json({
        success: true,
        data: { authority: endedAuthority },
        message: 'Authority ended successfully'
      });
    } catch (error) {
      logger.error('End authority error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end authority'
      });
    }
  }
  
  async checkProximity(req, res) {
    try {
      const { authorityId } = req.params;
      const { latitude, longitude, maxDistance = 1.0 } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }
      
      const proximityData = await Authority.checkProximity(
        authorityId,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(maxDistance)
      );
      
      res.json({
        success: true,
        data: {
          workersNearby: proximityData,
          count: proximityData.length
        }
      });
    } catch (error) {
      logger.error('Check proximity error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check proximity'
      });
    }
  }
  
  async getUserAuthorities(req, res) {
    try {
      const user = req.user;
      const { activeOnly = true } = req.query;
      
      const authorities = await Authority.getUserAuthorities(
        user.User_ID,
        activeOnly === 'true'
      );
      
      res.json({
        success: true,
        data: {
          authorities,
          count: authorities.length
        }
      });
    } catch (error) {
      logger.error('Get user authorities error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user authorities'
      });
    }
  }
  
  async getAuthorityStats(req, res) {
    try {
      const user = req.user;
      const { agencyId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Only administrators can view agency stats (scoped by agency unless super admin)
      if (user.Role !== 'Administrator' || !canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
      
      const stats = await Authority.getAuthorityStats(
        parseInt(agencyId),
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );
      
      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      logger.error('Get authority stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get authority statistics'
      });
    }
  }

  async getAuthorityHistory(req, res) {
    try {
      const user = req.user;
      const { agencyId } = req.params;
      const filters = {
        startDate: req.query.startDate ? new Date(req.query.startDate) : null,
        endDate: req.query.endDate ? new Date(req.query.endDate) : null,
        authorityType: req.query.authorityType,
        subdivision: req.query.subdivision,
        employeeName: req.query.employeeName
      };

      // Check permissions
      if ((user.Role !== 'Administrator' && user.Role !== 'Supervisor') || !canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const authorities = await Authority.getAuthorityHistory(
        parseInt(agencyId),
        filters
      );

      res.json({
        success: true,
        data: {
          authorities,
          count: authorities.length
        }
      });
    } catch (error) {
      logger.error('Get authority history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get authority history'
      });
    }
  }

  async getAuthorityOverlaps(req, res) {
    try {
      const user = req.user;
      const { agencyId } = req.params;

      // Check permissions
      if ((user.Role !== 'Administrator' && user.Role !== 'Supervisor') || !canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const overlaps = await Authority.getAuthorityOverlaps(parseInt(agencyId));

      // Calculate stats
      const stats = {
        totalOverlaps: overlaps.length,
        criticalOverlaps: overlaps.filter(o => o.Severity === 'Critical').length,
        resolvedToday: 0, // Would need to query resolved overlaps from today
        avgResolutionTime: 0 // Would need historical resolution data
      };

      res.json({
        success: true,
        data: {
          overlaps,
          stats
        }
      });
    } catch (error) {
      logger.error('Get authority overlaps error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get authority overlaps'
      });
    }
  }

  async resolveOverlap(req, res) {
    try {
      const user = req.user;
      const { overlapId } = req.params;
      const { notes } = req.body;

      // Check permissions
      if (user.Role !== 'Administrator' && user.Role !== 'Supervisor') {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const overlap = await Authority.getOverlapById(parseInt(overlapId));
      if (!overlap) {
        return res.status(404).json({
          success: false,
          error: 'Overlap not found'
        });
      }
      if (!canAccessAgency(user, Number(overlap.Agency_ID))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      await Authority.resolveOverlap(parseInt(overlapId), notes);

      logger.info(`Overlap ${overlapId} resolved by user ${user.User_ID} (${user.Employee_Name})`);

      res.json({
        success: true,
        message: 'Overlap marked as resolved'
      });
    } catch (error) {
      logger.error('Resolve overlap error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve overlap'
      });
    }
  }
  
  async canViewAuthority(user, authority) {
    // Administrators can view within their scoped agency unless super admin.
    if (user.Role === 'Administrator') {
      return canAccessAgency(user, Number(authority.Agency_ID));
    }
    
    // Supervisors can view authorities in their agency
    if (user.Role === 'Supervisor') {
      return canAccessAgency(user, Number(authority.Agency_ID));
    }
    
    // Field workers can only view their own authorities
    return user.User_ID === authority.User_ID;
  }
}

module.exports = new AuthorityController();

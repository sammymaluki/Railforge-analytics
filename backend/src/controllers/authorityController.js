const Authority = require('../models/Authority');
const { logger } = require('../config/logger');
const { getSocketIO } = require('../config/socket');
const emailService = require('../services/emailService');
const sql = require('mssql');
const { poolPromise } = require('../config/database');

class AuthorityController {
  async createAuthority(req, res) {
    try {
      const user = req.user;
      const authorityData = req.body;

      // Normalize optional expiration to prevent invalid null/empty values reaching the model.
      if (authorityData.expirationTime === null || authorityData.expirationTime === '') {
        delete authorityData.expirationTime;
      }
      
      // Add user ID to authority data
      authorityData.userId = user.User_ID;
      
      // Use employee name and contact from user if not provided
      if (!authorityData.employeeNameDisplay) {
        authorityData.employeeNameDisplay = user.Employee_Name;
      }
      if (!authorityData.employeeContactDisplay) {
        authorityData.employeeContactDisplay = user.Employee_Contact;
      }
      
      const result = await Authority.create(authorityData);
      
      // Log authority creation
      logger.info(`Authority created: ID ${result.authorityId} by user ${user.User_ID} (${user.Employee_Name})`);
      
      // If overlap detected, send real-time alerts and email notifications
      if (result.hasOverlap && result.overlapDetails.length > 0) {
        for (const overlap of result.overlapDetails) {
          // Send socket alert to both users
          const socket = getSocketIO();
          
          // Alert to overlapping authority user
          socket.to(`user-${overlap.User_ID}`).emit('authority_overlap', {
            type: 'OVERLAP_DETECTED',
            message: `Authority overlap detected with ${authorityData.employeeNameDisplay}`,
            details: {
              yourAuthority: {
                beginMP: overlap.Begin_MP,
                endMP: overlap.End_MP
              },
              overlappingAuthority: {
                employeeName: authorityData.employeeNameDisplay,
                employeeContact: authorityData.employeeContactDisplay,
                beginMP: authorityData.beginMP,
                endMP: authorityData.endMP
              }
            },
            timestamp: new Date()
          });
          
          // Alert to new authority user
          socket.to(`user-${user.User_ID}`).emit('authority_overlap', {
            type: 'OVERLAP_DETECTED',
            message: `Authority overlap detected with ${overlap.Employee_Name_Display}`,
            details: {
              yourAuthority: {
                beginMP: authorityData.beginMP,
                endMP: authorityData.endMP
              },
              overlappingAuthority: {
                employeeName: overlap.Employee_Name_Display,
                employeeContact: overlap.Employee_Contact_Display,
                beginMP: overlap.Begin_MP,
                endMP: overlap.End_MP
              }
            },
            timestamp: new Date()
          });
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
        data: result,
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
        authorities = await Authority.getActiveAuthorities(
          subdivisionId ? parseInt(subdivisionId) : null,
          trackType,
          trackNumber
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
      
      if (authority.User_ID !== user.User_ID && user.Role !== 'Administrator') {
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
      
      // Only administrators can view agency stats
      if (user.Role !== 'Administrator') {
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
      if (user.Role !== 'Administrator' && user.Role !== 'Supervisor') {
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
      if (user.Role !== 'Administrator' && user.Role !== 'Supervisor') {
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
    // Administrators can view all
    if (user.Role === 'Administrator') {
      return true;
    }
    
    // Supervisors can view authorities in their agency
    if (user.Role === 'Supervisor') {
      // Need to check if authority belongs to same agency
      // This would require joining with subdivisions and agencies
      // For now, return true (implement properly in production)
      return true;
    }
    
    // Field workers can only view their own authorities
    return user.User_ID === authority.User_ID;
  }
}

module.exports = new AuthorityController();

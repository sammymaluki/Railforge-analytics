const BrandingConfiguration = require('../models/BrandingConfiguration');
const { logger } = require('../config/logger');
const path = require('path');
const fs = require('fs').promises;
const { canAccessAgency } = require('../utils/rbac');

class BrandingController {
  /**
   * Get branding configuration for an agency
   */
  async getBranding(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;

      // Verify access (users can only access their own agency's branding unless admin)
      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const branding = await BrandingConfiguration.getBrandingWithDefaults(parseInt(agencyId));

      res.json({
        success: true,
        data: { branding }
      });
    } catch (error) {
      logger.error('Get branding error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get branding configuration'
      });
    }
  }

  /**
   * Update branding configuration
   */
  async updateBranding(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;
      const brandingData = req.body;

      // Only administrators can update branding
      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can update branding'
        });
      }

      // Validate required fields
      const { appName, primaryColor, secondaryColor, accentColor } = brandingData;

      if (!appName || !primaryColor || !secondaryColor || !accentColor) {
        return res.status(400).json({
          success: false,
          error: 'App name and colors are required'
        });
      }

      // Validate color formats
      const colors = [primaryColor, secondaryColor, accentColor];
      for (const color of colors) {
        if (!BrandingConfiguration.validateColor(color)) {
          return res.status(400).json({
            success: false,
            error: `Invalid color format: ${color}. Use hex format (e.g., #FFD100)`
          });
        }
      }

      const branding = await BrandingConfiguration.upsertBranding(
        parseInt(agencyId),
        brandingData
      );

      logger.info(`Branding updated for agency ${agencyId} by user ${user.User_ID}`);

      // Send email notification to admin
      if (process.env.ADMIN_EMAIL) {
        // TODO: Implement email notification
        logger.info(`Branding change notification should be sent to ${process.env.ADMIN_EMAIL}`);
      }

      res.json({
        success: true,
        data: { branding },
        message: 'Branding configuration updated successfully'
      });
    } catch (error) {
      logger.error('Update branding error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update branding configuration'
      });
    }
  }

  /**
   * Upload logo
   */
  async uploadLogo(req, res) {
    try {
      const { agencyId } = req.params;
      const { logoType } = req.query; // 'logo' or 'icon'
      const user = req.user;

      // Only administrators can upload logos
      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can upload logos'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type. Only PNG, JPEG, and SVG are allowed'
        });
      }

      // Generate URL for the uploaded file
      const logoUrl = `/uploads/branding/${req.file.filename}`;

      // Update branding configuration
      const branding = await BrandingConfiguration.updateLogoUrl(
        parseInt(agencyId),
        logoUrl,
        logoType || 'logo'
      );

      logger.info(`Logo uploaded for agency ${agencyId} by user ${user.User_ID}`);

      res.json({
        success: true,
        data: {
          logoUrl,
          branding
        },
        message: 'Logo uploaded successfully'
      });
    } catch (error) {
      logger.error('Upload logo error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload logo'
      });
    }
  }

  /**
   * Delete logo
   */
  async deleteLogo(req, res) {
    try {
      const { agencyId } = req.params;
      const { logoType } = req.query;
      const user = req.user;

      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can delete logos'
        });
      }

      // Get current branding to find logo path
      const currentBranding = await BrandingConfiguration.getByAgencyId(parseInt(agencyId));
      
      if (!currentBranding) {
        return res.status(404).json({
          success: false,
          error: 'Branding configuration not found'
        });
      }

      const logoPath = logoType === 'icon' ? currentBranding.Icon_URL : currentBranding.Logo_URL;

      // Delete from filesystem
      if (logoPath) {
        try {
          const fullPath = path.join(__dirname, '../../public', logoPath);
          await fs.unlink(fullPath);
        } catch (error) {
          logger.warn(`Failed to delete logo file: ${error.message}`);
        }
      }

      // Update branding to remove logo URL
      const branding = await BrandingConfiguration.updateLogoUrl(
        parseInt(agencyId),
        null,
        logoType || 'logo'
      );

      logger.info(`Logo deleted for agency ${agencyId} by user ${user.User_ID}`);

      res.json({
        success: true,
        data: { branding },
        message: 'Logo deleted successfully'
      });
    } catch (error) {
      logger.error('Delete logo error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete logo'
      });
    }
  }

  /**
   * Get custom terminology
   */
  async getTerminology(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;

      if (!canAccessAgency(user, parseInt(agencyId))) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const terminology = await BrandingConfiguration.getTerminology(parseInt(agencyId));

      res.json({
        success: true,
        data: { terminology }
      });
    } catch (error) {
      logger.error('Get terminology error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get terminology'
      });
    }
  }

  /**
   * Update custom terminology
   */
  async updateTerminology(req, res) {
    try {
      const { agencyId } = req.params;
      const user = req.user;
      const { terminology } = req.body;

      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Only administrators can update terminology'
        });
      }

      if (!terminology || typeof terminology !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid terminology object'
        });
      }

      // Get current branding
      const currentBranding = await BrandingConfiguration.getBrandingWithDefaults(parseInt(agencyId));

      // Update with new terminology
      const branding = await BrandingConfiguration.upsertBranding(parseInt(agencyId), {
        appName: currentBranding.App_Name,
        primaryColor: currentBranding.Primary_Color,
        secondaryColor: currentBranding.Secondary_Color,
        accentColor: currentBranding.Accent_Color,
        customTerminology: terminology
      });

      logger.info(`Terminology updated for agency ${agencyId} by user ${user.User_ID}`);

      res.json({
        success: true,
        data: { branding },
        message: 'Terminology updated successfully'
      });
    } catch (error) {
      logger.error('Update terminology error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update terminology'
      });
    }
  }

  /**
   * Get all branding configurations (admin only)
   */
  async getAllBranding(req, res) {
    try {
      const user = req.user;

      if (user.Role !== 'Administrator') {
        return res.status(403).json({
          success: false,
          error: 'Administrator access required'
        });
      }

      const branding = await BrandingConfiguration.getAllBranding();

      res.json({
        success: true,
        data: {
          branding,
          count: branding.length
        }
      });
    } catch (error) {
      logger.error('Get all branding error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get branding configurations'
      });
    }
  }
}

module.exports = new BrandingController();

const AlertConfiguration = require('../models/AlertConfiguration');
const { logger } = require('../config/logger');
const { canAccessAgency } = require('../utils/rbac');

/**
 * Get all alert configurations for an agency
 */
const getAlertConfigurations = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this agency\'s alert configurations'
      });
    }

    const alertConfigModel = AlertConfiguration;
    const configurations = await alertConfigModel.getAgencyConfigurations(agencyId);

    res.json({
      success: true,
      data: {
        configurations
      }
    });
  } catch (error) {
    logger.error('Error getting alert configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alert configurations',
      error: error.message
    });
  }
};

/**
 * Get alert configurations by type
 */
const getAlertConfigurationsByType = async (req, res) => {
  try {
    const { agencyId, configType } = req.params;

    // Check authorization
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Validate config type
    const validTypes = ['Boundary_Alert', 'Proximity_Alert', 'Overlap_Alert'];
    if (!validTypes.includes(configType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid config type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const alertConfigModel = AlertConfiguration;
    let configurations;

    if (configType === 'Boundary_Alert') {
      configurations = await alertConfigModel.getBoundaryAlerts(agencyId);
    } else if (configType === 'Proximity_Alert') {
      configurations = await alertConfigModel.getProximityAlerts(agencyId);
    } else {
      configurations = await alertConfigModel.getByType(agencyId, configType);
    }

    res.json({
      success: true,
      data: {
        configType,
        configurations
      }
    });
  } catch (error) {
    logger.error('Error getting alert configurations by type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alert configurations',
      error: error.message
    });
  }
};

/**
 * Create a new alert configuration
 */
const createAlertConfiguration = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const {
      configType,
      alertLevel,
      distanceMiles,
      timeMinutes,
      speedMph,
      message,
      soundEnabled,
      vibrationEnabled,
      notificationTitle
    } = req.body;

    // Only administrators can create alert configurations
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can create alert configurations'
      });
    }

    // Validate required fields
    if (!configType || !alertLevel) {
      return res.status(400).json({
        success: false,
        message: 'Config type and alert level are required'
      });
    }

    // Validate config type
    const validTypes = ['Boundary_Alert', 'Proximity_Alert', 'Overlap_Alert'];
    if (!validTypes.includes(configType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid config type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate alert level
    const validLevels = ['informational', 'warning', 'critical', 'Informational', 'Warning', 'Critical'];
    if (!validLevels.includes(alertLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid alert level. Must be one of: Informational, Warning, Critical'
      });
    }

    // Validate type-specific requirements
    if (configType === 'Boundary_Alert' || configType === 'Proximity_Alert') {
      if (distanceMiles === undefined || distanceMiles === null) {
        return res.status(400).json({
          success: false,
          message: 'Distance is required for boundary and proximity alerts'
        });
      }
    }

    const alertConfigModel = AlertConfiguration;
    const newConfig = await alertConfigModel.create({
      agencyId,
      configType,
      alertLevel,
      distanceMiles,
      timeMinutes,
      messageTemplate: message,
      description: req.body.description || null,
      soundEnabled: soundEnabled !== undefined ? soundEnabled : true,
      vibrationEnabled: vibrationEnabled !== undefined ? vibrationEnabled : true,
      notificationTitle
    });

    logger.info(`Alert configuration created: ${newConfig.Config_ID} by user ${req.user.User_ID}`);

    res.status(201).json({
      success: true,
      data: {
        configuration: newConfig
      },
      message: 'Alert configuration created successfully'
    });
  } catch (error) {
    logger.error('Error creating alert configuration:', error);

    const isDuplicateKey =
      error?.code === 'EREQUEST' &&
      (error?.number === 2627 || error?.number === 2601);

    if (isDuplicateKey) {
      return res.status(409).json({
        success: false,
        message: 'An alert configuration already exists for this Agency, Config Type, and Alert Level. Edit the existing configuration instead of creating a duplicate.',
        error: 'Duplicate alert configuration',
        details: {
          agencyId,
          configType: req.body?.configType,
          alertLevel: req.body?.alertLevel
        }
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create alert configuration',
      error: error.message
    });
  }
};

/**
 * Update an alert configuration
 */
const updateAlertConfiguration = async (req, res) => {
  try {
    const { configId } = req.params;
    const updateData = req.body;

    // Only administrators can update alert configurations
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update alert configurations'
      });
    }

    // Validate alert level if provided
    if (updateData.alertLevel) {
      const validLevels = ['informational', 'warning', 'critical', 'Informational', 'Warning', 'Critical'];
      if (!validLevels.includes(updateData.alertLevel)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid alert level. Must be one of: Informational, Warning, Critical'
        });
      }
    }

    const fieldsToUpdate = {};
    if (updateData.alertLevel !== undefined) {
      fieldsToUpdate.Alert_Level = updateData.alertLevel;
    }
    if (updateData.distanceMiles !== undefined) {
      fieldsToUpdate.Distance_Miles = updateData.distanceMiles;
    }
    if (updateData.timeMinutes !== undefined) {
      fieldsToUpdate.Time_Minutes = updateData.timeMinutes;
    }
    if (updateData.speedMph !== undefined) {
      fieldsToUpdate.Speed_MPH = updateData.speedMph;
    }
    if (updateData.message !== undefined) {
      fieldsToUpdate.Message = updateData.message;
    }
    if (updateData.soundEnabled !== undefined) {
      fieldsToUpdate.Sound_Enabled = updateData.soundEnabled;
    }
    if (updateData.vibrationEnabled !== undefined) {
      fieldsToUpdate.Vibration_Enabled = updateData.vibrationEnabled;
    }
    if (updateData.notificationTitle !== undefined) {
      fieldsToUpdate.Notification_Title = updateData.notificationTitle;
    }
    if (updateData.isActive !== undefined) {
      fieldsToUpdate.Is_Active = updateData.isActive;
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const alertConfigModel = AlertConfiguration;
    const updatedConfig = await alertConfigModel.update(configId, fieldsToUpdate);

    if (!updatedConfig) {
      return res.status(404).json({
        success: false,
        message: 'Alert configuration not found'
      });
    }

    logger.info(`Alert configuration updated: ${configId} by user ${req.user.User_ID}`);

    res.json({
      success: true,
      data: {
        configuration: updatedConfig
      },
      message: 'Alert configuration updated successfully'
    });
  } catch (error) {
    logger.error('Error updating alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert configuration',
      error: error.message
    });
  }
};

/**
 * Delete (soft delete) an alert configuration
 */
const deleteAlertConfiguration = async (req, res) => {
  try {
    const { configId } = req.params;

    // Only administrators can delete alert configurations
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can delete alert configurations'
      });
    }

    const alertConfigModel = AlertConfiguration;
    
    // Soft delete by setting Is_Active to false
    const result = await alertConfigModel.update(configId, { Is_Active: false });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Alert configuration not found'
      });
    }

    logger.info(`Alert configuration deleted: ${configId} by user ${req.user.User_ID}`);

    res.json({
      success: true,
      message: 'Alert configuration deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert configuration',
      error: error.message
    });
  }
};

/**
 * Bulk update alert configurations
 */
const bulkUpdateAlertConfigurations = async (req, res) => {
  try {
    const { configurations } = req.body;

    // Only administrators can bulk update
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can bulk update alert configurations'
      });
    }

    if (!Array.isArray(configurations) || configurations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Configurations array is required'
      });
    }

    const alertConfigModel = AlertConfiguration;
    const results = [];

    for (const config of configurations) {
      try {
        const { configId, ...updateData } = config;
        
        const fieldsToUpdate = {};
        if (updateData.alertLevel !== undefined) {
          fieldsToUpdate.Alert_Level = updateData.alertLevel;
        }
        if (updateData.distanceMiles !== undefined) {
          fieldsToUpdate.Distance_Miles = updateData.distanceMiles;
        }
        if (updateData.timeMinutes !== undefined) {
          fieldsToUpdate.Time_Minutes = updateData.timeMinutes;
        }
        if (updateData.speedMph !== undefined) {
          fieldsToUpdate.Speed_MPH = updateData.speedMph;
        }
        if (updateData.message !== undefined) {
          fieldsToUpdate.Message = updateData.message;
        }
        if (updateData.soundEnabled !== undefined) {
          fieldsToUpdate.Sound_Enabled = updateData.soundEnabled;
        }
        if (updateData.vibrationEnabled !== undefined) {
          fieldsToUpdate.Vibration_Enabled = updateData.vibrationEnabled;
        }
        if (updateData.isActive !== undefined) {
          fieldsToUpdate.Is_Active = updateData.isActive;
        }

        const updated = await alertConfigModel.update(configId, fieldsToUpdate);
        results.push({
          configId,
          success: !!updated,
          data: updated
        });
      } catch (error) {
        results.push({
          configId: config.configId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk update: ${successCount}/${configurations.length} configurations updated by user ${req.user.User_ID}`);

    res.json({
      success: true,
      data: {
        results,
        successCount,
        totalCount: configurations.length
      },
      message: `${successCount} of ${configurations.length} configurations updated successfully`
    });
  } catch (error) {
    logger.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update alert configurations',
      error: error.message
    });
  }
};

module.exports = {
  getAlertConfigurations,
  getAlertConfigurationsByType,
  createAlertConfiguration,
  updateAlertConfiguration,
  deleteAlertConfiguration,
  bulkUpdateAlertConfigurations
};

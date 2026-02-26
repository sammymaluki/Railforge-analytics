const { logger } = require('../config/logger');
const {
  getDefaultFieldConfigurations,
  getFieldConfigurations,
  setFieldConfigurations,
  getValidationRules
} = require('../services/agencyConfigService');
const { canAccessAgency } = require('../utils/rbac');

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value);

const deepMerge = (base, incoming) => {
  if (!isPlainObject(base) || !isPlainObject(incoming)) {
    return incoming;
  }

  const merged = { ...base };
  Object.keys(incoming).forEach((key) => {
    if (isPlainObject(incoming[key]) && isPlainObject(base[key])) {
      merged[key] = deepMerge(base[key], incoming[key]);
    } else {
      merged[key] = incoming[key];
    }
  });
  return merged;
};

/**
 * Get authority field configurations for an agency
 */
const getAuthorityFieldConfigurations = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization using normalized auth middleware user shape.
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const fieldConfigurations = getFieldConfigurations(agencyId);

    res.json({
      success: true,
      data: {
        fieldConfigurations,
        customFields: []
      }
    });
  } catch (error) {
    logger.error('Error getting authority field configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve field configurations',
      error: error.message
    });
  }
};

/**
 * Update authority field configurations
 */
const updateAuthorityFieldConfigurations = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { fieldConfigurations } = req.body;

    // Only administrators can update field configurations
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update field configurations'
      });
    }

    if (!fieldConfigurations || typeof fieldConfigurations !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Field configurations object is required'
      });
    }

    // Validate that required fields cannot be disabled
    const requiredFields = ['authorityType', 'subdivision', 'beginMP', 'endMP', 'trackType', 'trackNumber'];
    for (const field of requiredFields) {
      if (fieldConfigurations[field] && !fieldConfigurations[field].enabled) {
        return res.status(400).json({
          success: false,
          message: `Cannot disable required field: ${field}`
        });
      }
    }

    const defaultFieldConfigurations = getDefaultFieldConfigurations();
    const mergedFieldConfigurations = { ...defaultFieldConfigurations };

    Object.keys(fieldConfigurations).forEach((key) => {
      const incomingValue = fieldConfigurations[key];
      const defaultValue = defaultFieldConfigurations[key];

      if (isPlainObject(incomingValue) && isPlainObject(defaultValue)) {
        mergedFieldConfigurations[key] = deepMerge(defaultValue, incomingValue);
      } else {
        mergedFieldConfigurations[key] = incomingValue;
      }
    });

    setFieldConfigurations(agencyId, mergedFieldConfigurations);

    logger.info(`Authority field configurations updated for agency ${agencyId} by user ${req.user.User_ID}`);

    res.json({
      success: true,
      data: {
        fieldConfigurations: mergedFieldConfigurations
      },
      message: 'Field configurations updated successfully'
    });
  } catch (error) {
    logger.error('Error updating authority field configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update field configurations',
      error: error.message
    });
  }
};

/**
 * Get authority type options for an agency
 */
const getAuthorityTypeOptions = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const defaultTypes = [
      { value: 'Foul Time', label: 'Foul Time', color: '#FF5733' },
      { value: 'Maintenance Window', label: 'Maintenance Window', color: '#FFC300' },
      { value: 'Emergency Work', label: 'Emergency Work', color: '#C70039' },
      { value: 'Inspection', label: 'Inspection', color: '#3498DB' },
      { value: 'Construction', label: 'Construction', color: '#F39C12' },
      { value: 'Signal Work', label: 'Signal Work', color: '#9B59B6' },
      { value: 'Track Work', label: 'Track Work', color: '#27AE60' },
      { value: 'Other', label: 'Other', color: '#95A5A6' }
    ];

    res.json({
      success: true,
      data: {
        authorityTypes: defaultTypes
      }
    });
  } catch (error) {
    logger.error('Error getting authority type options:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve authority type options',
      error: error.message
    });
  }
};

/**
 * Add custom authority type option
 */
const addAuthorityTypeOption = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { value, label, color } = req.body;

    // Only administrators can add authority types
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can add authority types'
      });
    }

    if (!value || !label || !color) {
      return res.status(400).json({
        success: false,
        message: 'Value, label, and color are required'
      });
    }

    // Validate color format
    const hexColorRegex = /^#[0-9A-F]{6}$/i;
    if (!hexColorRegex.test(color)) {
      return res.status(400).json({
        success: false,
        message: 'Color must be in hex format (e.g., #FF5733)'
      });
    }

    // In production, this would be saved to database
    logger.info(`Authority type added for agency ${agencyId}: ${value} by user ${req.user.User_ID}`);

    res.status(201).json({
      success: true,
      data: {
        authorityType: { value, label, color }
      },
      message: 'Authority type added successfully'
    });
  } catch (error) {
    logger.error('Error adding authority type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add authority type',
      error: error.message
    });
  }
};

/**
 * Get validation rules for authority fields
 */
const getAuthorityValidationRules = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const validationRules = getValidationRules(agencyId);

    res.json({
      success: true,
      data: {
        validationRules
      }
    });
  } catch (error) {
    logger.error('Error getting validation rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve validation rules',
      error: error.message
    });
  }
};

module.exports = {
  getAuthorityFieldConfigurations,
  updateAuthorityFieldConfigurations,
  getAuthorityTypeOptions,
  addAuthorityTypeOption,
  getAuthorityValidationRules
};

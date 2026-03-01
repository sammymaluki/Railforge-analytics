const pinTypeModel = require('../models/PinType');
const { logger } = require('../config/logger');
const { canAccessAgency } = require('../utils/rbac');

const normalizePhotoAccessRoles = (value) => {
  if (Array.isArray(value)) {
    return value.map((role) => String(role).trim()).filter(Boolean).join(',');
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean)
      .join(',');
  }
  return 'Administrator,Supervisor,Field_Worker';
};

/**
 * Get all pin types for an agency
 */
const getPinTypes = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization - users can only view their agency's pin types
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this agency\'s pin types'
      });
    }

    const pinTypes = await pinTypeModel.findByAgency(agencyId);

    res.json({
      success: true,
      data: {
        pinTypes: pinTypes,
        total: pinTypes.length
      }
    });
  } catch (error) {
    logger.error('Error getting pin types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pin types',
      error: error.message
    });
  }
};

/**
 * Create a new pin type
 */
const createPinType = async (req, res) => {
  try {
    const { agencyId } = req.params;
    const {
      category: categoryRaw,
      subtype: subtypeRaw,
      pinCategory,
      pinSubtype,
      color: colorRaw,
      iconUrl,
      sortOrder,
      photosEnabled = true,
      photoRequired = false,
      maxPhotos = 1,
      maxPhotoSizeMb = 10,
      photoCompressionQuality = 80,
      photoRetentionDays = null,
      photoAccessRoles = 'Administrator,Supervisor,Field_Worker',
      photoExportMode = 'links'
    } = req.body;
    const category = String(categoryRaw ?? pinCategory ?? '').trim();
    const subtype = String(subtypeRaw ?? pinSubtype ?? '').trim();
    const color = String(colorRaw ?? '').trim();

    // Only administrators can create pin types
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can create pin types'
      });
    }

    // Validate required fields
    if (!category || !subtype || !color) {
      return res.status(400).json({
        success: false,
        message: 'Category, subtype, and color are required'
      });
    }

    // Validate color format (hex color)
    const hexColorRegex = /^#[0-9A-F]{6}$/i;
    if (!hexColorRegex.test(color)) {
      return res.status(400).json({
        success: false,
        message: 'Color must be in hex format (e.g., #FF5733)'
      });
    }

    const newPinType = await pinTypeModel.create({
      agencyId,
      pinCategory: category,
      pinSubtype: subtype,
      color,
      iconUrl,
      sortOrder: sortOrder || 0,
      photosEnabled: photosEnabled !== false,
      photoRequired: photoRequired === true,
      maxPhotos: Number(maxPhotos) > 0 ? Number(maxPhotos) : 1,
      maxPhotoSizeMb: Number(maxPhotoSizeMb) > 0 ? Number(maxPhotoSizeMb) : 10,
      photoCompressionQuality: Number(photoCompressionQuality) > 0 ? Number(photoCompressionQuality) : 80,
      photoRetentionDays: photoRetentionDays === '' || photoRetentionDays === null || photoRetentionDays === undefined
        ? null
        : (Number.isFinite(Number(photoRetentionDays)) ? Number(photoRetentionDays) : null),
      photoAccessRoles: normalizePhotoAccessRoles(photoAccessRoles),
      photoExportMode: ['links', 'attachments'].includes(photoExportMode) ? photoExportMode : 'links'
    });

    logger.info(`Pin type created: ${newPinType.Pin_Type_ID} by user ${req.user.User_ID}`);

    res.status(201).json({
      success: true,
      data: {
        pinType: {
          pinTypeId: newPinType.Pin_Type_ID,
          category: newPinType.Pin_Category,
          subtype: newPinType.Pin_Subtype,
          color: newPinType.Color,
          iconUrl: newPinType.Icon_URL,
          sortOrder: newPinType.Sort_Order,
          photosEnabled: newPinType.Photos_Enabled,
          photoRequired: newPinType.Photo_Required,
          maxPhotos: newPinType.Max_Photos,
          maxPhotoSizeMb: newPinType.Max_Photo_Size_MB,
          photoCompressionQuality: newPinType.Photo_Compression_Quality,
          photoRetentionDays: newPinType.Photo_Retention_Days,
          photoAccessRoles: newPinType.Photo_Access_Roles,
          photoExportMode: newPinType.Photo_Export_Mode
        }
      },
      message: 'Pin type created successfully'
    });
  } catch (error) {
    logger.error('Error creating pin type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create pin type',
      error: error.message
    });
  }
};

/**
 * Update a pin type
 */
const updatePinType = async (req, res) => {
  try {
    const { pinTypeId } = req.params;
    const {
      category: categoryRaw,
      subtype: subtypeRaw,
      pinCategory,
      pinSubtype,
      color: colorRaw,
      iconUrl,
      sortOrder,
      isActive,
      photosEnabled,
      photoRequired,
      maxPhotos,
      maxPhotoSizeMb,
      photoCompressionQuality,
      photoRetentionDays,
      photoAccessRoles,
      photoExportMode
    } = req.body;
    const category = categoryRaw !== undefined || pinCategory !== undefined
      ? String(categoryRaw ?? pinCategory ?? '').trim()
      : undefined;
    const subtype = subtypeRaw !== undefined || pinSubtype !== undefined
      ? String(subtypeRaw ?? pinSubtype ?? '').trim()
      : undefined;
    const color = colorRaw !== undefined ? String(colorRaw).trim() : undefined;

    // Only administrators can update pin types
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can update pin types'
      });
    }

    // Validate color format if provided
    if (color) {
      const hexColorRegex = /^#[0-9A-F]{6}$/i;
      if (!hexColorRegex.test(color)) {
        return res.status(400).json({
          success: false,
          message: 'Color must be in hex format (e.g., #FF5733)'
        });
      }
    }

    const updateData = {};
    if (category !== undefined) {
      updateData.Pin_Category = category;
    }
    if (subtype !== undefined) {
      updateData.Pin_Subtype = subtype;
    }
    if (color !== undefined) {
      updateData.Color = color;
    }
    if (iconUrl !== undefined) {
      updateData.Icon_URL = iconUrl;
    }
    if (sortOrder !== undefined) {
      updateData.Sort_Order = sortOrder;
    }
    if (isActive !== undefined) {
      updateData.Is_Active = isActive;
    }
    if (photosEnabled !== undefined) {
      updateData.Photos_Enabled = photosEnabled === true;
    }
    if (photoRequired !== undefined) {
      updateData.Photo_Required = photoRequired === true;
    }
    if (maxPhotos !== undefined) {
      updateData.Max_Photos = Number(maxPhotos) > 0 ? Number(maxPhotos) : 1;
    }
    if (maxPhotoSizeMb !== undefined) {
      updateData.Max_Photo_Size_MB = Number(maxPhotoSizeMb) > 0 ? Number(maxPhotoSizeMb) : 10;
    }
    if (photoCompressionQuality !== undefined) {
      const quality = Number(photoCompressionQuality);
      updateData.Photo_Compression_Quality = Math.min(100, Math.max(10, Number.isFinite(quality) ? quality : 80));
    }
    if (photoRetentionDays !== undefined) {
      updateData.Photo_Retention_Days = photoRetentionDays === '' || photoRetentionDays === null
        ? null
        : (Number.isFinite(Number(photoRetentionDays)) ? Number(photoRetentionDays) : null);
    }
    if (photoAccessRoles !== undefined) {
      updateData.Photo_Access_Roles = normalizePhotoAccessRoles(photoAccessRoles);
    }
    if (photoExportMode !== undefined) {
      updateData.Photo_Export_Mode = ['links', 'attachments'].includes(photoExportMode) ? photoExportMode : 'links';
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    const updatedPinType = await pinTypeModel.update(pinTypeId, updateData);

    if (!updatedPinType) {
      return res.status(404).json({
        success: false,
        message: 'Pin type not found'
      });
    }

    logger.info(`Pin type updated: ${pinTypeId} by user ${req.user.User_ID}`);

    res.json({
      success: true,
      data: {
        pinType: {
          pinTypeId: updatedPinType.Pin_Type_ID,
          category: updatedPinType.Pin_Category,
          subtype: updatedPinType.Pin_Subtype,
          color: updatedPinType.Color,
          iconUrl: updatedPinType.Icon_URL,
          sortOrder: updatedPinType.Sort_Order,
          isActive: updatedPinType.Is_Active,
          photosEnabled: updatedPinType.Photos_Enabled,
          photoRequired: updatedPinType.Photo_Required,
          maxPhotos: updatedPinType.Max_Photos,
          maxPhotoSizeMb: updatedPinType.Max_Photo_Size_MB,
          photoCompressionQuality: updatedPinType.Photo_Compression_Quality,
          photoRetentionDays: updatedPinType.Photo_Retention_Days,
          photoAccessRoles: updatedPinType.Photo_Access_Roles,
          photoExportMode: updatedPinType.Photo_Export_Mode
        }
      },
      message: 'Pin type updated successfully'
    });
  } catch (error) {
    logger.error('Error updating pin type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pin type',
      error: error.message
    });
  }
};

/**
 * Delete (soft delete) a pin type
 */
const deletePinType = async (req, res) => {
  try {
    const { pinTypeId } = req.params;

    // Only administrators can delete pin types
    if (req.user.Role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can delete pin types'
      });
    }

    // Soft delete by setting Is_Active to false
    const result = await pinTypeModel.update(pinTypeId, { Is_Active: false });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Pin type not found'
      });
    }

    logger.info(`Pin type deleted: ${pinTypeId} by user ${req.user.User_ID}`);

    res.json({
      success: true,
      message: 'Pin type deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting pin type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete pin type',
      error: error.message
    });
  }
};

/**
 * Get pin type categories for an agency
 */
const getPinCategories = async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Check authorization
    if (!canAccessAgency(req.user, parseInt(agencyId))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const pinTypes = await pinTypeModel.findByAgency(agencyId);

    // Extract unique categories
    const categories = [...new Set(pinTypes.map(pt => pt.Pin_Category))];

    res.json({
      success: true,
      data: {
        categories
      }
    });
  } catch (error) {
    logger.error('Error getting pin categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pin categories',
      error: error.message
    });
  }
};

module.exports = {
  getPinTypes,
  createPinType,
  updatePinType,
  deletePinType,
  getPinCategories
};

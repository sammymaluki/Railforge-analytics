const Pin = require('../models/Pin');
const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const parseRoleList = (value) => {
  if (!value) return ['Administrator', 'Supervisor', 'Field_Worker'];
  if (Array.isArray(value)) return value.map((role) => String(role).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
};

const normalizeRole = (role) => {
  const raw = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!raw) return '';
  if (['admin', 'administrator', 'super_admin', 'superadmin', 'system_admin', 'systemadministrator'].includes(raw)) {
    return 'administrator';
  }
  if (['field_worker', 'fieldworker'].includes(raw)) {
    return 'field_worker';
  }
  if (['supervisor'].includes(raw)) {
    return 'supervisor';
  }
  if (['viewer', 'read_only', 'readonly'].includes(raw)) {
    return 'viewer';
  }
  return raw;
};

const userCanViewPhotos = (userRole, pinType) => {
  const normalizedUserRole = normalizeRole(userRole);
  if (!normalizedUserRole) return false;
  if (normalizedUserRole === 'administrator') {
    return true;
  }

  const allowedRoles = parseRoleList(pinType?.Photo_Access_Roles).map(normalizeRole);
  return allowedRoles.includes(normalizedUserRole);
};

const normalizePhotosFromRequest = (body = {}) => {
  if (Array.isArray(body.photos)) {
    return body.photos
      .map((photo) => {
        if (typeof photo === 'string') {
          return { url: photo, metadata: null };
        }
        if (!photo || !photo.url) return null;
        return {
          url: photo.url,
          metadata: photo.metadata || null
        };
      })
      .filter(Boolean);
  }

  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter(Boolean) : [];
  const photoMetadata = Array.isArray(body.photoMetadata) ? body.photoMetadata : [];

  if (photoUrls.length > 0) {
    return photoUrls.map((url, index) => ({
      url,
      metadata: photoMetadata[index] || null
    }));
  }

  if (body.photoUrl) {
    return [{ url: body.photoUrl, metadata: null }];
  }

  return [];
};

const normalizeStoredPhotoUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // If absolute URL, normalize malformed paths but preserve origin.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const pathname = parsed.pathname || '';
      const malformedMatch = pathname.match(/\/uploads\/?[a-z]:\/.*public\/uploads\/(.+)$/i)
        || pathname.match(/\/uploads\/?[a-z]:\/(.+pin-[^/]+\.(?:jpg|jpeg|png|gif|webp))$/i);
      if (malformedMatch?.[1]) {
        parsed.pathname = `/uploads/${malformedMatch[1].replace(/^\/+/, '')}`;
        return parsed.toString();
      }
      return raw;
    } catch (_error) {
      // Fall through to string-based normalization below.
    }
  }

  if (/^\/uploads\/.+/i.test(raw)) return raw;

  // Recover malformed records containing filesystem path fragments.
  const normalized = raw.replace(/\\/g, '/');
  const publicMatch = normalized.match(/public\/uploads\/(.+)$/i);
  if (publicMatch?.[1]) {
    return `/uploads/${publicMatch[1].replace(/^\/+/, '')}`;
  }

  // Handle malformed '/uploadsD:/.../pin-xxx.jpg' by extracting filename.
  const filenameMatch = normalized.match(/(pin-[^/]+\.(?:jpg|jpeg|png|gif|webp))/i);
  if (filenameMatch?.[1]) {
    return `/uploads/${filenameMatch[1]}`;
  }

  // If it starts with '/uploads' but misses slash separator.
  if (/^\/uploads/i.test(normalized)) {
    return normalized.replace(/^\/uploads(?!\/)/i, '/uploads/');
  }

  return raw;
};

class PinController {
  constructor() {
    // Bind methods to preserve 'this' context when used as route handlers
    this.createPin = this.createPin.bind(this);
    this.getPinsByAuthority = this.getPinsByAuthority.bind(this);
    this.getTripPins = this.getTripPins.bind(this);
    this.updatePin = this.updatePin.bind(this);
  }

  async getPinTypeConfig(pinTypeId) {
    const pool = getConnection();
    const result = await pool.request()
      .input('pinTypeId', sql.Int, pinTypeId)
      .query(`
        SELECT TOP 1
          Pin_Type_ID,
          Photos_Enabled,
          Photo_Required,
          Max_Photos,
          Max_Photo_Size_MB,
          Photo_Compression_Quality,
          Photo_Retention_Days,
          Photo_Access_Roles,
          Photo_Export_Mode
        FROM Pin_Types
        WHERE Pin_Type_ID = @pinTypeId
          AND Is_Active = 1
      `);

    return result.recordset[0] || null;
  }

  validatePhotoRules(pinType, photos = []) {
    const photosEnabled = pinType?.Photos_Enabled !== false;
    const photoRequired = pinType?.Photo_Required === true;
    const maxPhotos = Number(pinType?.Max_Photos || 1);

    if (!photosEnabled && photos.length > 0) {
      return 'Photos are disabled for this category';
    }

    if (photoRequired && photos.length === 0) {
      return 'This category requires at least one photo';
    }

    if (maxPhotos > 0 && photos.length > maxPhotos) {
      return `Maximum ${maxPhotos} photos allowed for this category`;
    }

    return null;
  }

  applyPhotoVisibility(pinRecord, canView) {
    const photoUrls = parseJsonArray(pinRecord.Photo_URLs).map(normalizeStoredPhotoUrl).filter(Boolean);
    const photoMetadata = parseJsonArray(pinRecord.Photo_Metadata);
    const fallbackUrl = normalizeStoredPhotoUrl(pinRecord.Photo_URL);
    const fallback = fallbackUrl ? [fallbackUrl] : [];
    const normalizedUrls = photoUrls.length > 0 ? photoUrls : fallback;

    if (!canView) {
      return {
        ...pinRecord,
        Photo_URL: null,
        Photo_URLs: JSON.stringify([]),
        Photo_Metadata: JSON.stringify([]),
        photoCount: normalizedUrls.length
      };
    }

    return {
      ...pinRecord,
      Photo_URL: normalizedUrls[0] || null,
      Photo_URLs: JSON.stringify(normalizedUrls),
      Photo_Metadata: JSON.stringify(photoMetadata)
    };
  }

  async createPin(req, res) {
    try {
      const user = req.user;
      const {
        authorityId = null,
        pinTypeId,
        latitude,
        longitude,
        trackType = null,
        trackNumber = null,
        mp = null,
        notes = null
      } = req.body;

      if (!pinTypeId || !latitude || !longitude) {
        return res.status(400).json({ success: false, error: 'Missing required pin fields (pinTypeId, latitude, longitude)' });
      }

      const photos = normalizePhotosFromRequest(req.body);
      const pinType = await this.getPinTypeConfig(pinTypeId);
      if (!pinType) {
        return res.status(404).json({ success: false, error: 'Pin type not found or inactive' });
      }

      const photoRuleError = this.validatePhotoRules(pinType, photos);
      if (photoRuleError) {
        return res.status(400).json({ success: false, error: photoRuleError });
      }

      const created = await Pin.create({
        authorityId,
        pinTypeId,
        latitude,
        longitude,
        trackType,
        trackNumber,
        mp,
        notes,
        photos
      });

      const canView = userCanViewPhotos(user.Role, pinType);
      const responseRecord = this.applyPhotoVisibility(created, canView);

      if (authorityId) {
        logger.info(`Pin created by user ${user.User_ID} for authority ${authorityId}`);
      } else {
        logger.info(`Standalone pin created by user ${user.User_ID}`);
      }

      res.json({ success: true, data: responseRecord });
    } catch (error) {
      logger.error('Create pin error:', error);
      res.status(500).json({ success: false, error: 'Failed to create pin' });
    }
  }

  async getPinsByAuthority(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;

      if (!authorityId) {
        return res.status(400).json({ success: false, error: 'Authority ID required' });
      }

      const pins = await Pin.getAuthorityPins(authorityId);
      const mapped = pins.map((pin) => this.applyPhotoVisibility(pin, userCanViewPhotos(user.Role, pin)));
      res.json({ success: true, data: mapped });
    } catch (error) {
      logger.error('Get pins error:', error);
      res.status(500).json({ success: false, error: 'Failed to get pins' });
    }
  }

  async getTripPins(req, res) {
    try {
      const { authorityId } = req.params;
      const user = req.user;
      if (!authorityId) { return res.status(400).json({ success: false, error: 'Authority ID required' }); }

      const pins = await Pin.getTripReport(authorityId);
      const mapped = pins.map((pin) => this.applyPhotoVisibility(pin, userCanViewPhotos(user.Role, pin)));
      res.json({ success: true, data: mapped });
    } catch (error) {
      logger.error('Get trip pins error:', error);
      res.status(500).json({ success: false, error: 'Failed to get trip pins' });
    }
  }

  async updatePin(req, res) {
    try {
      const { pinId } = req.params;
      const {
        pinTypeId = null,
        latitude = null,
        longitude = null,
        trackType = null,
        trackNumber = null,
        mp = null,
        notes = null
      } = req.body;

      if (!pinId) {
        return res.status(400).json({ success: false, error: 'Pin ID is required' });
      }

      const photos = normalizePhotosFromRequest(req.body);
      let pinType = null;
      if (pinTypeId) {
        pinType = await this.getPinTypeConfig(pinTypeId);
        if (!pinType) {
          return res.status(404).json({ success: false, error: 'Pin type not found or inactive' });
        }
      }

      if (pinType) {
        const photoRuleError = this.validatePhotoRules(pinType, photos);
        if (photoRuleError) {
          return res.status(400).json({ success: false, error: photoRuleError });
        }
      }

      const updated = await Pin.update(pinId, {
        pinTypeId,
        latitude,
        longitude,
        trackType,
        trackNumber,
        mp,
        notes,
        photos
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Pin not found' });
      }

      const canView = pinType ? userCanViewPhotos(req.user.Role, pinType) : true;
      res.json({ success: true, data: this.applyPhotoVisibility(updated, canView) });
    } catch (error) {
      logger.error('Update pin error:', error);
      res.status(500).json({ success: false, error: 'Failed to update pin' });
    }
  }
}

module.exports = new PinController();

const Pin = require('../models/Pin');
const { logger } = require('../config/logger');
const { getConnection, sql } = require('../config/database');

class PinController {
  async createPin(req, res) {
    try {
      const user = req.user;
      const {
        authorityId = null, // Make optional
        pinTypeId,
        latitude,
        longitude,
        trackType = null,
        trackNumber = null,
        mp = null,
        notes = null,
        photoUrl = null
      } = req.body;

      if (!pinTypeId || !latitude || !longitude) {
        return res.status(400).json({ success: false, error: 'Missing required pin fields (pinTypeId, latitude, longitude)' });
      }

      // TODO: verify authority belongs to user's agency or user (authorization checks)

      const created = await Pin.create({
        authorityId,
        pinTypeId,
        latitude,
        longitude,
        trackType,
        trackNumber,
        mp,
        notes,
        photoUrl
      });

      if (authorityId) {
        logger.info(`Pin created by user ${user.User_ID} for authority ${authorityId}`);
      } else {
        logger.info(`Standalone pin created by user ${user.User_ID}`);
      }

      res.json({ success: true, data: created });
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
      res.json({ success: true, data: pins });
    } catch (error) {
      logger.error('Get pins error:', error);
      res.status(500).json({ success: false, error: 'Failed to get pins' });
    }
  }

  async getTripPins(req, res) {
    try {
      const { authorityId } = req.params;
      if (!authorityId) { return res.status(400).json({ success: false, error: 'Authority ID required' }); }

      const pins = await Pin.getTripReport(authorityId);
      res.json({ success: true, data: pins });
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
        notes = null,
        photoUrl = null
      } = req.body;

      if (!pinId) {
        return res.status(400).json({ success: false, error: 'Pin ID is required' });
      }

      const updated = await Pin.update(pinId, {
        pinTypeId,
        latitude,
        longitude,
        trackType,
        trackNumber,
        mp,
        notes,
        photoUrl
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Pin not found' });
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Update pin error:', error);
      res.status(500).json({ success: false, error: 'Failed to update pin' });
    }
  }
}

module.exports = new PinController();

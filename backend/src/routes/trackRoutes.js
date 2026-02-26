const express = require('express');
const router = express.Router();
const trackController = require('../controllers/trackController');
const { auth } = require('../middleware/auth');

// Get milepost reference data for subdivision
router.get('/mileposts/:subdivisionId', auth, trackController.getMileposts);

// Get structured track-search options for subdivision
router.get('/search-options', auth, trackController.getTrackSearchOptions);

// Calculate track-based distance between two GPS coordinates
router.post('/calculate-distance', auth, trackController.calculateDistance);

// Interpolate milepost from GPS coordinates
router.post('/interpolate-milepost', auth, trackController.interpolateMilepost);

// Track location search
router.post('/location-search', auth, trackController.searchTrackLocation);

module.exports = router;

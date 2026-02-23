const express = require('express');
const router = express.Router();
const pinController = require('../controllers/pinController');
const { auth } = require('../middleware/auth');

// Protect routes
router.use(auth);

// Create a new pin (payload: authorityId, pinTypeId, latitude, longitude, notes, optional mp/track)
router.post('/', pinController.createPin);
router.put('/:pinId', pinController.updatePin);

// Get pins for an authority (trip summary / pin list)
router.get('/authority/:authorityId', pinController.getPinsByAuthority);

// Get pins formatted for trip report
router.get('/trip/:authorityId', pinController.getTripPins);

module.exports = router;

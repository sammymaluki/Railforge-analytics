const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const mapLayerController = require('../controllers/mapLayerController');

// List available layers for the user's agency
router.get('/layers', auth, (req, res) => mapLayerController.listLayers(req, res));

// Fetch data for a specific layer
router.get('/layers/:layerId', auth, (req, res) => mapLayerController.getLayerData(req, res));

// Get authority boundary (for highlighting on map)
router.get('/authority/:authorityId/boundary', auth, (req, res) => mapLayerController.getAuthorityBoundary(req, res));

// Search across layers
router.get('/search', auth, (req, res) => mapLayerController.searchLayers(req, res));

module.exports = router;

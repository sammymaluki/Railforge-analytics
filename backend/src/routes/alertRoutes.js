const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const { auth } = require('../middleware/auth');

// Require authentication for alerts
router.use(auth);

router.get('/config/:agencyId', alertController.getAlertConfigurations);
router.post('/config/:agencyId', alertController.createAlertConfiguration);
router.put('/config/:configId', alertController.updateAlertConfiguration);

router.get('/user', alertController.getUserAlerts);
router.post('/:alertId/read', alertController.markAlertAsRead);
router.delete('/:alertId', alertController.deleteAlert);
router.get('/stats/:agencyId', alertController.getAlertStats);
router.get('/:agencyId/export', alertController.exportAlertHistory);
router.get('/:agencyId/history', alertController.getAlertHistory);

module.exports = router;

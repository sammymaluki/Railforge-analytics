const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { auth } = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get audit logs with filtering and pagination
router.get('/:agencyId/logs', auditLogController.getAuditLogs);

// Get audit log statistics
router.get('/:agencyId/stats', auditLogController.getAuditLogStats);

// Get available action types
router.get('/:agencyId/action-types', auditLogController.getActionTypes);

// Get affected tables
router.get('/:agencyId/affected-tables', auditLogController.getAffectedTables);

// Export audit logs to Excel
router.get('/:agencyId/export', auditLogController.exportAuditLogs);

// Retention policy controls
router.get('/:agencyId/retention-policy', auditLogController.getAuditRetentionPolicy);
router.put('/:agencyId/retention-policy', auditLogController.updateAuditRetentionPolicy);
router.post('/:agencyId/retention-run', auditLogController.runAuditRetention);

module.exports = router;

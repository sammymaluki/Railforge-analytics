const express = require('express');
const router = express.Router();
const authorityController = require('../controllers/authorityController');
const { auth, authorize } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// All authority routes require authentication
router.use(auth);

// Get active authorities
router.get('/active', authorityController.getActiveAuthorities);

// Get user's authorities
router.get('/my', authorityController.getUserAuthorities);

// Get authority history for an agency
router.get('/history/:agencyId', authorize('Administrator', 'Supervisor'), 
  authorityController.getAuthorityHistory
);

// Get authority overlaps for an agency
router.get('/overlaps/:agencyId', authorize('Administrator', 'Supervisor'),
  authorityController.getAuthorityOverlaps
);

// Resolve an overlap
router.post('/overlaps/:overlapId/resolve', authorize('Administrator', 'Supervisor'),
  authorityController.resolveOverlap
);

// Create authority
router.post('/', authorize('Field_Worker', 'Supervisor', 'Administrator'), 
  authorityController.createAuthority
);

// Authority-specific routes
router.get('/:authorityId', authorityController.getAuthorityById);
router.post('/:authorityId/end', authorize('Field_Worker', 'Supervisor', 'Administrator'), 
  authorityController.endAuthority
);
router.post('/:authorityId/check-proximity', 
  validate(schemas.gpsUpdate),
  authorityController.checkProximity
);

// Admin-only routes
router.get('/stats/:agencyId', authorize('Administrator'), 
  authorityController.getAuthorityStats
);

module.exports = router;

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { auth } = require('../middleware/auth');
const { logger } = require('../config/logger');

// All routes require authentication
router.use(auth);

/**
 * Get dashboard statistics
 */
router.get('/:agencyId/dashboard', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { startDate, endDate, forceRefresh } = req.query;

    // Verify access
    if (req.user.Role !== 'Administrator' && req.user.Agency_ID !== parseInt(agencyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (forceRefresh === 'true') {
      analyticsService.clearCache();
    }

    const stats = await analyticsService.getDashboardStats(
      parseInt(agencyId),
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard statistics',
      error: error.message
    });
  }
});

/**
 * Get trend data
 */
router.get('/:agencyId/trends/:metric', async (req, res) => {
  try {
    const { agencyId, metric } = req.params;
    const { period = '7d' } = req.query;

    // Verify access
    if (req.user.Role !== 'Administrator' && req.user.Agency_ID !== parseInt(agencyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const trendData = await analyticsService.getTrendData(
      parseInt(agencyId),
      metric,
      period
    );

    res.json({
      success: true,
      data: trendData
    });

  } catch (error) {
    logger.error('Get trend data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve trend data',
      error: error.message
    });
  }
});

/**
 * Get safety metrics
 */
router.get('/:agencyId/safety-metrics', async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Verify access
    if (req.user.Role !== 'Administrator' && req.user.Agency_ID !== parseInt(agencyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const safetyMetrics = await analyticsService.getSafetyMetrics(parseInt(agencyId));

    res.json({
      success: true,
      data: safetyMetrics
    });

  } catch (error) {
    logger.error('Get safety metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve safety metrics',
      error: error.message
    });
  }
});

/**
 * Generate report
 */
router.post('/:agencyId/reports/:reportType', async (req, res) => {
  try {
    const { agencyId, reportType } = req.params;
    const { startDate, endDate, options = {} } = req.body;

    // Verify access
    if (req.user.Role !== 'Administrator' && req.user.Agency_ID !== parseInt(agencyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const reportData = await analyticsService.generateReport(
      parseInt(agencyId),
      reportType,
      new Date(startDate),
      new Date(endDate),
      { ...options, userId: req.user.id }
    );

    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    logger.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

/**
 * Clear analytics cache (admin only)
 */
router.post('/:agencyId/cache/clear', async (req, res) => {
  try {
    const { agencyId } = req.params;

    // Verify admin access
    if (req.user.Role !== 'Administrator' || req.user.Agency_ID !== parseInt(agencyId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - Administrator role required'
      });
    }

    analyticsService.clearCache();

    res.json({
      success: true,
      message: 'Analytics cache cleared successfully'
    });

  } catch (error) {
    logger.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message
    });
  }
});

module.exports = router;

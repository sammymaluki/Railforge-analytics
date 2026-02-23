const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger } = require('../config/logger');

const authUserCache = new Map();
const AUTH_USER_CACHE_TTL_MS = 30000;

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token is required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Use a short-lived cache to avoid hammering DB for each parallel API request.
    const cacheKey = `${decoded.userId}:${decoded.agencyId || ''}:${decoded.role || ''}`;
    const cached = authUserCache.get(cacheKey);

    let user = null;
    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    } else {
      user = await User.findById(decoded.userId);
      if (user) {
        authUserCache.set(cacheKey, {
          user,
          expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
        });
      }
    }
    
    if (!user || !user.Is_Active) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    // Check if user belongs to the agency from token (if agency ID in token)
    if (decoded.agencyId && decoded.agencyId !== user.Agency_ID) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    // Handle database connection errors
    if (error.code === 'ESOCKET' || error.message?.includes('Connection lost')) {
      return res.status(503).json({
        success: false,
        error: 'Database service temporarily unavailable'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.Role)) {
      logger.warn(`Unauthorized access attempt by user ${req.user.User_ID} (${req.user.Role})`);
      
      return res.status(403).json({
        success: false,
        error: `Access denied. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

const agencyAccess = async (req, res, next) => {
  try {
    const userAgencyId = req.user.Agency_ID;
    const requestedAgencyId = req.params.agencyId || req.body.agencyId;

    // Administrators can access all agencies
    if (req.user.Role === 'Administrator') {
      return next();
    }

    // Users can only access their own agency
    if (requestedAgencyId && parseInt(requestedAgencyId) !== userAgencyId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this agency'
      });
    }

    // If no agency specified, default to user's agency
    if (!req.params.agencyId && !req.body.agencyId) {
      req.params.agencyId = userAgencyId;
    }

    next();
  } catch (error) {
    logger.error('Agency access check error:', error);
    res.status(403).json({
      success: false,
      error: 'Access denied'
    });
  }
};

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.User_ID,
      username: user.Username,
      agencyId: user.Agency_ID,
      role: user.Role,
      employeeName: user.Employee_Name
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = {
  auth,
  authorize,
  agencyAccess,
  generateToken
};

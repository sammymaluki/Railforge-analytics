const Joi = require('joi');
const { logger } = require('../config/logger');

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation failed:', {
        path: req.path,
        method: req.method,
        errors
      });

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request data with validated data
    req[property] = schema.validate(req[property]).value;
    next();
  };
};

// Schemas for different operations
const schemas = {
  // Auth schemas
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(50).required(),
    password: Joi.string().min(8).max(100).required(),
    employeeName: Joi.string().min(2).max(100).required(),
    employeeContact: Joi.string().max(20),
    email: Joi.string().email().max(100),
    role: Joi.string().valid('Administrator', 'Supervisor', 'Field_Worker', 'Viewer'),
    agencyId: Joi.number().integer().positive().required()
  }),

  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
    clientType: Joi.string().valid('admin_portal', 'mobile').optional()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(100).required()
  }),

  // Authority schemas
  createAuthority: Joi.object({
    authorityType: Joi.string().valid(
      'Track_Authority',
      'Track_Authorit',
      'Lone_Worker_Authority',
      'Lone_Worker_Authorit',
      'Lone_Worker',
      'Lone Worker',
      'Lone Worker Authority'
    ).required(),
    subdivisionId: Joi.number().integer().positive().required(),
    beginMP: Joi.number().precision(4).required(),
    endMP: Joi.number().precision(4).min(Joi.ref('beginMP')).required(),
    trackType: Joi.string().valid('Main', 'Yard', 'Siding', 'Storage', 'X_Over', 'Other').required(),
    trackNumber: Joi.string().max(20).required(),
    employeeNameDisplay: Joi.string().max(100),
    employeeContactDisplay: Joi.string().max(20),
    expirationTime: Joi.alternatives()
      .try(
        Joi.date().greater('now'),
        Joi.valid(null),
        Joi.string().trim().valid('')
      )
      .optional()
  }),

  // Pin schemas
  createPin: Joi.object({
    authorityId: Joi.number().integer().positive().required(),
    pinTypeId: Joi.number().integer().positive().required(),
    latitude: Joi.number().min(-90).max(90).precision(8).required(),
    longitude: Joi.number().min(-180).max(180).precision(8).required(),
    trackType: Joi.string().valid('Main', 'Yard', 'Siding', 'Storage', 'X_Over', 'Other'),
    trackNumber: Joi.string().max(20),
    mp: Joi.number().precision(4),
    notes: Joi.string().max(1000),
    photoUrl: Joi.string().uri()
  }),

  // GPS schemas
  gpsUpdate: Joi.object({
    latitude: Joi.number().min(-90).max(90).precision(8).required(),
    longitude: Joi.number().min(-180).max(180).precision(8).required(),
    speed: Joi.number().precision(2).min(0).allow(null),
    heading: Joi.number().precision(2).min(0).max(360).allow(null),
    accuracy: Joi.number().precision(2).min(0).allow(null),
    timestamp: Joi.alternatives().try(Joi.date().iso(), Joi.number().integer()),
    satelliteCount: Joi.number().integer().min(0).allow(null),
    signalLost: Joi.boolean().optional(),
    hasSignal: Joi.boolean().optional(),
    authorityId: Joi.number().integer().positive().required()
  }),

  // Alert configuration schemas
  alertConfig: Joi.object({
    configType: Joi.string().valid('Boundary_Alert', 'Proximity_Alert', 'Overlap_Alert').required(),
    alertLevel: Joi.string().valid('Informational', 'Warning', 'Critical').required(),
    distanceMiles: Joi.number().precision(2).min(0.01).max(10).required(),
    messageTemplate: Joi.string().max(500),
    soundFile: Joi.string().max(200),
    vibrationPattern: Joi.string().max(50)
  }),

  // Agency schemas
  agency: Joi.object({
    agencyCD: Joi.string().alphanum().max(10).required(),
    agencyName: Joi.string().max(100).required(),
    region: Joi.string().max(50),
    contactEmail: Joi.string().email().max(100),
    contactPhone: Joi.string().max(20)
  })
};

module.exports = {
  validate,
  schemas
};

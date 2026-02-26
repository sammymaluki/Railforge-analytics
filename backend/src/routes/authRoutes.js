const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

// Public routes
router.get('/register/options', authController.getRegistrationOptions);
router.post('/register', validate(schemas.register), authController.register);
router.post('/login', validate(schemas.login), authController.login);

// Protected routes
router.get('/verify', auth, authController.verify);
router.post('/logout', auth, authController.logout);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, authController.updateProfile);
router.post('/change-password', auth, validate(schemas.changePassword), authController.changePassword);
router.post('/refresh-token', authController.refreshToken);

module.exports = router;

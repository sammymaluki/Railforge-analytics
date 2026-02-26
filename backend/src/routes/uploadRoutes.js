const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');

// Configure multer
const memoryStorage = multer.memoryStorage();
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../../public/uploads');
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split('.').pop();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `pin-${unique}.${ext}`);
  }
});

const memoryUpload = multer({ storage: memoryStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const diskUpload = multer({ storage: diskStorage, limits: { fileSize: 10 * 1024 * 1024 } });

router.use(auth);

// Pin photo upload (saved to disk so controller can store URL)
router.post('/pin-photo', diskUpload.single('photo'), uploadController.uploadPinPhoto);

// Track data upload (Admin only) - use memory upload so controller can read buffer
router.post('/track-data', authorize('Administrator'), memoryUpload.single('file'), uploadController.uploadTrackData);

// Milepost geometry upload (Admin only)
router.post('/milepost-geometry', authorize('Administrator'), memoryUpload.single('file'), uploadController.uploadMilepostGeometry);

// Download templates
router.get('/templates/track-data', authorize('Administrator'), uploadController.downloadTrackTemplate);
router.get('/templates/milepost-geometry', authorize('Administrator'), uploadController.downloadMilepostTemplate);
router.get('/templates/users', authorize('Administrator'), uploadController.downloadUsersTemplate);

// User upload (Admin only)
router.post('/users', authorize('Administrator'), memoryUpload.single('file'), uploadController.uploadUsers);

module.exports = router;

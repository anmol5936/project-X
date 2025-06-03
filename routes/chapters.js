const express = require('express');
const { adminAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const { 
  getAllChapters, 
  getChapterById, 
  uploadChapters 
} = require('../controllers/chapters');

const router = express.Router();

// Get all chapters (with filtering and pagination)
router.get('/', cacheMiddleware(3600), getAllChapters);

// Get a specific chapter by ID
router.get('/:id', cacheMiddleware(3600), getChapterById);

// Upload chapters (admin only)
router.post('/', adminAuth, uploadChapters);

module.exports = router;
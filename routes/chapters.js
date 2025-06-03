const express = require('express');
const { adminAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');
const { 
  getAllChapters, 
  getChapterById, 
  uploadChapters 
} = require('../controllers/chapters');

const router = express.Router();


router.get('/', cacheMiddleware(3600), getAllChapters);

router.get('/:id', cacheMiddleware(3600), getChapterById);


router.post('/', adminAuth, uploadChapters);

module.exports = router;
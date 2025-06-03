const multer = require('multer');
const fs = require('fs');
const { Chapter, validateChapter } = require('../models/chapter');
const { clearCache } = require('../middleware/cache');

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp'); // Use temporary directory
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter to only accept JSON files
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
}).single('file');

/**
 * Get all chapters with filtering and pagination
 * @route GET /api/v1/chapters
 */
const getAllChapters = async (req, res) => {
  try {
    const { 
      class: className, 
      unit, 
      status, 
      weakChapters, 
      subject,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build filter object
    const filter = {};
    if (className) filter.class = className;
    if (unit) filter.unit = unit;
    if (status) filter.status = status;
    if (subject) filter.subject = subject;
    if (weakChapters === 'true') filter.isWeakChapter = true;
    if (weakChapters === 'false') filter.isWeakChapter = false;

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const total = await Chapter.countDocuments(filter);

    // Get chapters with pagination
    const chapters = await Chapter.find(filter)
      .skip(skip)
      .limit(limitNum)
      .sort({ subject: 1, chapter: 1 });

    // Return response
    res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      chapters
    });
  } catch (error) {
    console.error('Error getting chapters:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving chapters',
      error: error.message
    });
  }
};

/**
 * Get a specific chapter by ID
 * @route GET /api/v1/chapters/:id
 */
const getChapterById = async (req, res) => {
  try {
    const chapter = await Chapter.findById(req.params.id);
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    res.status(200).json({
      success: true,
      chapter
    });
  } catch (error) {
    console.error('Error getting chapter by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving chapter',
      error: error.message
    });
  }
};

/**
 * Upload JSON file with chapters
 * @route POST /api/v1/chapters
 */
const uploadChapters = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a JSON file'
      });
    }

    try {
      // Read the uploaded file
      const fileData = fs.readFileSync(req.file.path, 'utf8');
      let chapters;
      
      try {
        chapters = JSON.parse(fileData);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON file',
          error: error.message
        });
      }

      // Validate chapters are in an array
      if (!Array.isArray(chapters)) {
        return res.status(400).json({
          success: false,
          message: 'JSON file must contain an array of chapters'
        });
      }

      // Process each chapter
      const validChapters = [];
      const failedChapters = [];

      for (const chapter of chapters) {
        // Validate chapter against schema
        const { error } = validateChapter(chapter);
        
        if (error) {
          failedChapters.push({
            chapter,
            error: error.details.map(detail => detail.message).join(', ')
          });
        } else {
          validChapters.push(chapter);
        }
      }

      // Insert valid chapters
      let successCount = 0;
      if (validChapters.length > 0) {
        const result = await Chapter.insertMany(validChapters, { ordered: false });
        successCount = result.length;
        
        // Clear cache after adding new chapters
        await clearCache();
      }

      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);

      // Return result
      res.status(200).json({
        success: true,
        message: `Successfully processed ${chapters.length} chapters`,
        successCount,
        failedCount: failedChapters.length,
        failedChapters
      });
    } catch (error) {
      console.error('Error uploading chapters:', error);
      
      // Clean up the uploaded file if it exists
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({
        success: false,
        message: 'Server error while processing uploaded file',
        error: error.message
      });
    }
  });
};

module.exports = {
  getAllChapters,
  getChapterById,
  uploadChapters
};
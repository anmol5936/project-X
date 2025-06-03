const multer = require('multer');
const fs = require('fs');
const { Chapter, validateChapter } = require('../models/chapter');
const { clearCache } = require('../middleware/cache');


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp'); 
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});


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
    fileSize: 10 * 1024 * 1024 
  }
}).single('file');


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

    
    const filter = {};
    if (className) filter.class = className;
    if (unit) filter.unit = unit;
    if (status) filter.status = status;
    if (subject) filter.subject = subject;
    if (weakChapters === 'true') filter.isWeakChapter = true;
    if (weakChapters === 'false') filter.isWeakChapter = false;

    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    
    const total = await Chapter.countDocuments(filter);

    
    const chapters = await Chapter.find(filter)
      .skip(skip)
      .limit(limitNum)
      .sort({ subject: 1, chapter: 1 });

    
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


const uploadChapters = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a JSON file'
      });
    }

    try {
      
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

      
      if (!Array.isArray(chapters)) {
        return res.status(400).json({
          success: false,
          message: 'JSON file must contain an array of chapters'
        });
      }

      
      const validChapters = [];
      const failedChapters = [];

      for (const chapter of chapters) {
        
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

      
      let successCount = 0;
      if (validChapters.length > 0) {
        const result = await Chapter.insertMany(validChapters, { ordered: false });
        successCount = result.length;
        
        
        await clearCache();
      }

      
      fs.unlinkSync(req.file.path);

      
      res.status(200).json({
        success: true,
        message: `Successfully processed ${chapters.length} chapters`,
        successCount,
        failedCount: failedChapters.length,
        failedChapters
      });
    } catch (error) {
      console.error('Error uploading chapters:', error);
      
      
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
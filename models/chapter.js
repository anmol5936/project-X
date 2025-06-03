const mongoose = require('mongoose');
const Joi = require('joi');

// Define the schema for validation
const chapterSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  chapter: {
    type: String,
    required: [true, 'Chapter name is required'],
    trim: true
  },
  class: {
    type: String,
    required: [true, 'Class is required'],
    trim: true
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true
  },
  yearWiseQuestionCount: {
    type: Map,
    of: {
      type: Number,
      min: 0
    },
    validate: {
      validator: function(value) {
        if (!value) return false;
        
        // Convert Map to object if it's a Map
        const obj = value instanceof Map ? Object.fromEntries(value) : value;
        
        // Check if all years are between 2019-2025
        const validYears = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
        const years = Object.keys(obj);
        
        // All years must be valid and all values must be non-negative
        return years.every(year => validYears.includes(year) && obj[year] >= 0);
      },
      message: 'Year must be between 2019-2025 and question count must be non-negative'
    },
    required: [true, 'Year-wise question count is required']
  },
  questionSolved: {
    type: Number,
    required: [true, 'Questions solved count is required'],
    min: 0
  },
  status: {
    type: String,
    enum: {
      values: ['Not Started', 'In Progress', 'Completed'],
      message: 'Status must be one of: Not Started, In Progress, Completed'
    },
    required: [true, 'Status is required']
  },
  isWeakChapter: {
    type: Boolean,
    required: [true, 'Weak chapter status is required']
  }
}, {
  timestamps: true
});

// Create index for commonly queried fields
chapterSchema.index({ subject: 1 });
chapterSchema.index({ class: 1 });
chapterSchema.index({ unit: 1 });
chapterSchema.index({ status: 1 });
chapterSchema.index({ isWeakChapter: 1 });

// Create the model
const Chapter = mongoose.model('Chapter', chapterSchema);

// Validation schema for incoming data
const validateChapter = (chapter) => {
  const schema = Joi.object({
    subject: Joi.string().required(),
    chapter: Joi.string().required(),
    class: Joi.string().required(),
    unit: Joi.string().required(),
    yearWiseQuestionCount: Joi.object().pattern(
      Joi.string().valid('2019', '2020', '2021', '2022', '2023', '2024', '2025'),
      Joi.number().min(0)
    ).required(),
    questionSolved: Joi.number().min(0).required(),
    status: Joi.string().valid('Not Started', 'In Progress', 'Completed').required(),
    isWeakChapter: Joi.boolean().required()
  });

  return schema.validate(chapter);
};

module.exports = {
  Chapter,
  validateChapter
};
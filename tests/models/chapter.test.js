const mongoose = require('mongoose');
const { Chapter, validateChapter } = require('../../models/chapter');

describe('Chapter Model', () => {
  // Test suite for Mongoose schema validation
  describe('Mongoose Schema Validation', () => {
    it('should require all necessary fields', async () => {
      const chapter = new Chapter({});
      let err;
      try {
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.subject).toBeDefined();
      expect(err.errors.chapter).toBeDefined();
      expect(err.errors.class).toBeDefined();
      expect(err.errors.unit).toBeDefined();
      expect(err.errors.yearWiseQuestionCount).toBeDefined();
      expect(err.errors.questionSolved).toBeDefined();
      expect(err.errors.status).toBeDefined();
      expect(err.errors.isWeakChapter).toBeDefined();
    });

    it('should have a valid status enum', async () => {
      const chapter = new Chapter({
        subject: 'Physics',
        chapter: 'Mechanics',
        class: '11',
        unit: '1',
        yearWiseQuestionCount: { '2020': 10 },
        questionSolved: 5,
        status: 'InvalidStatus', // Invalid status
        isWeakChapter: false,
      });
      let err;
      try {
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
      expect(err.errors.status.message).toBe('Status must be one of: Not Started, In Progress, Completed');
    });

    it('should require questionSolved to be a non-negative number', async () => {
      const chapter = new Chapter({
        subject: 'Maths',
        chapter: 'Algebra',
        class: '10',
        unit: '2',
        yearWiseQuestionCount: { '2021': 5 },
        questionSolved: -1, // Invalid value
        status: 'In Progress',
        isWeakChapter: true,
      });
      let err;
      try {
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.questionSolved).toBeDefined();
    });

    it('should validate yearWiseQuestionCount for years and non-negative counts', async () => {
      let chapter = new Chapter({
        subject: 'Chemistry',
        chapter: 'Organic',
        class: '12',
        unit: '3',
        yearWiseQuestionCount: { '2018': 10 }, // Invalid year
        questionSolved: 0,
        status: 'Not Started',
        isWeakChapter: false,
      });
      let err;
      try {
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors['yearWiseQuestionCount']).toBeDefined();

      chapter = new Chapter({
        subject: 'Chemistry',
        chapter: 'Organic',
        class: '12',
        unit: '3',
        yearWiseQuestionCount: { '2020': -5 }, // Invalid count
        questionSolved: 0,
        status: 'Not Started',
        isWeakChapter: false,
      });
      try {
        err = null; // Reset err
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors['yearWiseQuestionCount']).toBeDefined();
    });

    it('should successfully validate a correct chapter object', async () => {
      const chapter = new Chapter({
        subject: 'Biology',
        chapter: 'Genetics',
        class: '12',
        unit: '4',
        yearWiseQuestionCount: { '2022': 15, '2023': 10 },
        questionSolved: 10,
        status: 'Completed',
        isWeakChapter: false,
      });
      let err;
      try {
        await chapter.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });

  // Test suite for Joi validation
  describe('Joi Validation (validateChapter)', () => {
    const validChapterData = {
      subject: 'Physics',
      chapter: 'Optics',
      class: '12',
      unit: '5',
      yearWiseQuestionCount: { '2023': 10, '2024': 5 },
      questionSolved: 8,
      status: 'In Progress',
      isWeakChapter: true,
    };

    it('should pass validation for a valid chapter object', () => {
      const { error } = validateChapter(validChapterData);
      expect(error).toBeUndefined();
    });

    it('should fail validation if required fields are missing', () => {
      const incompleteData = { ...validChapterData };
      delete incompleteData.subject; // Remove a required field
      const { error } = validateChapter(incompleteData);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('"subject" is required');
    });

    it('should fail validation for invalid year in yearWiseQuestionCount', () => {
      const invalidYearData = {
        ...validChapterData,
        yearWiseQuestionCount: { '2018': 5 }, // Invalid year
      };
      const { error } = validateChapter(invalidYearData);
      expect(error).toBeDefined();
      // Joi's error message might be generic for object.pattern
      expect(error.details[0].message).toContain('yearWiseQuestionCount');
    });

    it('should fail validation for negative count in yearWiseQuestionCount', () => {
        const invalidCountData = {
            ...validChapterData,
            yearWiseQuestionCount: { '2023': -5 }, // Invalid count
        };
        const { error } = validateChapter(invalidCountData);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('"yearWiseQuestionCount.2023" must be greater than or equal to 0');
    });

    it('should fail validation for invalid status', () => {
      const invalidStatusData = {
        ...validChapterData,
        status: 'Paused', // Invalid status
      };
      const { error } = validateChapter(invalidStatusData);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('"status" must be one of [Not Started, In Progress, Completed]');
    });

    it('should fail validation if questionSolved is negative', () => {
      const invalidSolvedData = {
        ...validChapterData,
        questionSolved: -5, // Invalid value
      };
      const { error } = validateChapter(invalidSolvedData);
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('"questionSolved" must be greater than or equal to 0');
    });

    it('should fail validation if isWeakChapter is not a boolean', () => {
        const invalidWeakChapterData = {
            ...validChapterData,
            isWeakChapter: "yes", // Invalid type
        };
        const { error } = validateChapter(invalidWeakChapterData);
        expect(error).toBeDefined();
        expect(error.details[0].message).toContain('"isWeakChapter" must be a boolean');
    });
  });
});

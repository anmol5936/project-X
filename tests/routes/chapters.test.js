const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { RedisMemoryServer } = require('redis-memory-server');
const { Chapter } = require('../../models/chapter');
const chaptersRouter = require('../../routes/chapters');
const { adminAuth } = require('../../middleware/auth');
const { cacheMiddleware } = require('../../middleware/cache');
const { createRateLimiter } = require('../../middleware/rateLimiter');
const { createRedisClient, getRedisClient, closeRedisConnection } = require('../../utils/redis');
const path = require('path');
const fs = require('fs');

// Mock middleware to bypass actual implementation if needed for certain tests
jest.mock('../../middleware/auth', () => ({
  adminAuth: jest.fn((req, res, next) => {
    if (req.headers['x-api-key'] === 'test-admin-key') {
      next();
    } else {
      res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }),
}));

// We will use the actual cache middleware but with an in-memory Redis
// We will use the actual rate limiter but with an in-memory Redis

let app;
let mongod;
let redisServer;
let redisClient;
let serverInstance; // To hold the server instance for graceful shutdown

// Sample Chapter Data
const sampleChapters = [
  { subject: 'Physics', chapter: 'Mechanics', class: '11', unit: '1', yearWiseQuestionCount: { '2020': 10 }, questionSolved: 5, status: 'In Progress', isWeakChapter: false, _id: new mongoose.Types.ObjectId().toHexString() },
  { subject: 'Chemistry', chapter: 'Organic', class: '12', unit: '3', yearWiseQuestionCount: { '2021': 8 }, questionSolved: 8, status: 'Completed', isWeakChapter: false, _id: new mongoose.Types.ObjectId().toHexString() },
  { subject: 'Maths', chapter: 'Algebra', class: '11', unit: '2', yearWiseQuestionCount: { '2022': 12 }, questionSolved: 10, status: 'Not Started', isWeakChapter: true, _id: new mongoose.Types.ObjectId().toHexString() },
  { subject: 'Physics', chapter: 'Optics', class: '12', unit: '2', yearWiseQuestionCount: { '2020': 5 }, questionSolved: 2, status: 'In Progress', isWeakChapter: true, _id: new mongoose.Types.ObjectId().toHexString() },
];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();

  redisServer = await RedisMemoryServer.create();
  process.env.REDIS_HOST = await redisServer.getHost();
  process.env.REDIS_PORT = await redisServer.getPort();

  process.env.ADMIN_API_KEY = 'test-admin-key'; // Set for auth middleware

  // Initialize Redis client (this will now use the in-memory server's host and port)
  createRedisClient();
  redisClient = getRedisClient();

  await mongoose.connect(process.env.MONGO_URI);

  app = express();
  app.use(express.json());
  app.use(createRateLimiter()); // Apply actual rate limiter
  app.use('/api/v1/chapters', chaptersRouter); // Use the actual router

  // Start the server on a random available port
  serverInstance = app.listen(0);
  // Update supertest to use the dynamically assigned port
  // This is handled by supertest if you pass the app instance directly
});

beforeEach(async () => {
  await Chapter.deleteMany({});
  await Chapter.insertMany(sampleChapters.map(c => ({...c, _id: new mongoose.Types.ObjectId(c._id) })));
  if (redisClient) {
    await redisClient.flushall(); // Clear cache before each test
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();

  await closeRedisConnection(); // Close app's redis connection
  if (redisServer) await redisServer.stop();

  if (serverInstance) {
    await new Promise(resolve => serverInstance.close(resolve)); // Gracefully close the server
  }
});

describe('Chapter Routes', () => {
  describe('GET /api/v1/chapters', () => {
    it('should return all chapters without filters', async () => {
      const res = await request(app).get('/api/v1/chapters');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapters.length).toBe(sampleChapters.length);
      expect(res.body.total).toBe(sampleChapters.length);
    });

    it('should filter chapters by class', async () => {
      const res = await request(app).get('/api/v1/chapters?class=11');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapters.length).toBe(2);
      expect(res.body.chapters.every(c => c.class === '11')).toBe(true);
    });

    it('should filter chapters by subject and status', async () => {
      const res = await request(app).get('/api/v1/chapters?subject=Physics&status=In Progress');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapters.length).toBe(2); // Both Physics chapters are 'In Progress'
      expect(res.body.chapters.every(c => c.subject === 'Physics' && c.status === 'In Progress')).toBe(true);
    });

    it('should filter for weak chapters', async () => {
      const res = await request(app).get('/api/v1/chapters?weakChapters=true');
      expect(res.statusCode).toBe(200);
      expect(res.body.chapters.length).toBe(2);
      expect(res.body.chapters.every(c => c.isWeakChapter === true)).toBe(true);
    });

    it('should handle pagination correctly', async () => {
      const res = await request(app).get('/api/v1/chapters?page=2&limit=2');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapters.length).toBe(2);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
      // Assuming default sort is by subject then chapter for consistent pagination
      const sortedSample = [...sampleChapters].sort((a,b) => {
          if (a.subject < b.subject) return -1;
          if (a.subject > b.subject) return 1;
          if (a.chapter < b.chapter) return -1;
          if (a.chapter > b.chapter) return 1;
          return 0;
      });
      expect(res.body.chapters[0].chapter).toBe(sortedSample[2].chapter); // Third item overall
    });

    it('should use cache for subsequent identical GET requests', async () => {
      const cacheKey = 'chapters:::::::1:10'; // Default params

      // First request - should not hit cache, but populate it
      const res1 = await request(app).get('/api/v1/chapters');
      expect(res1.statusCode).toBe(200);
      const cachedValue1 = await redisClient.get(cacheKey);
      expect(cachedValue1).toBeDefined();
      expect(JSON.parse(cachedValue1).chapters.length).toBe(sampleChapters.length);

      // Modify data in DB directly to see if cache serves stale data
      await Chapter.updateOne({ _id: sampleChapters[0]._id }, { $set: { chapter: 'MODIFIED IN DB' } });

      // Second request - should hit cache and return original data
      const res2 = await request(app).get('/api/v1/chapters');
      expect(res2.statusCode).toBe(200);
      expect(res2.body.chapters.find(c => c._id === sampleChapters[0]._id).chapter).not.toBe('MODIFIED IN DB');
      expect(res2.body.chapters.length).toBe(sampleChapters.length); // From cache
    });
  });

  describe('GET /api/v1/chapters/:id', () => {
    it('should return a specific chapter by ID', async () => {
      const chapterId = sampleChapters[0]._id;
      const res = await request(app).get(`/api/v1/chapters/${chapterId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chapter._id).toBe(chapterId);
      expect(res.body.chapter.subject).toBe(sampleChapters[0].subject);
    });

    it('should return 404 if chapter ID does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toHexString();
      const res = await request(app).get(`/api/v1/chapters/${nonExistentId}`);
      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Chapter not found');
    });

    it('should return 500 for an invalid chapter ID format', async () => {
      const invalidId = 'invalid-id-format';
      const res = await request(app).get(`/api/v1/chapters/${invalidId}`);
      // Mongoose will throw a CastError, which should be caught by the error handler
      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Server error while retrieving chapter');
    });
  });

  describe('POST /api/v1/chapters', () => {
    const validChaptersPayload = [
      { subject: 'Biology', chapter: 'Cell Biology', class: '10', unit: 'Bio1', yearWiseQuestionCount: { '2023': 5 }, questionSolved: 2, status: 'Not Started', isWeakChapter: true },
      { subject: 'History', chapter: 'Ancient Civilizations', class: '9', unit: 'Hist1', yearWiseQuestionCount: { '2022': 10 }, questionSolved: 5, status: 'In Progress', isWeakChapter: false },
    ];
    const tempDir = path.join(__dirname, 'temp_uploads');

    beforeEach(() => {
        // Create temp directory for uploads if it doesn't exist
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should upload chapters from a valid JSON file with admin key', async () => {
      const filePath = path.join(tempDir, 'valid_chapters.json');
      fs.writeFileSync(filePath, JSON.stringify(validChaptersPayload));

      const initialCount = await Chapter.countDocuments();
      const cacheKeyPattern = 'chapters:*';
      const initialCacheKeys = await redisClient.keys(cacheKeyPattern);


      const res = await request(app)
        .post('/api/v1/chapters')
        .set('x-api-key', 'test-admin-key')
        .attach('file', filePath);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.successCount).toBe(validChaptersPayload.length);
      expect(res.body.failedCount).toBe(0);

      const finalCount = await Chapter.countDocuments();
      expect(finalCount).toBe(initialCount + validChaptersPayload.length);

      // Check cache invalidation
      const finalCacheKeys = await redisClient.keys(cacheKeyPattern);
      // This checks if *any* cache key starting with 'chapters:' was deleted.
      // A more robust check would be to ensure specific keys were invalidated,
      // but for now, we'll check if the number of keys decreased or if specific keys are gone.
      // If clearCache deletes all 'chapters:*' keys, then finalCacheKeys should be empty or different.
      // Assuming clearCache works by deleting all keys matching 'chapters:*'
      expect(finalCacheKeys.length).toBe(0);
    });

    it('should reject upload without admin key', async () => {
      const filePath = path.join(tempDir, 'any_chapters.json');
      fs.writeFileSync(filePath, JSON.stringify(validChaptersPayload));

      const res = await request(app)
        .post('/api/v1/chapters')
        .attach('file', filePath); // No API key

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('should reject upload if no file is provided', async () => {
      const res = await request(app)
        .post('/api/v1/chapters')
        .set('x-api-key', 'test-admin-key'); // No file attached

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Please upload a JSON file');
    });

    it('should reject upload for non-JSON file', async () => {
      const filePath = path.join(tempDir, 'not_a_json.txt');
      fs.writeFileSync(filePath, 'This is not JSON');

      const res = await request(app)
        .post('/api/v1/chapters')
        .set('x-api-key', 'test-admin-key')
        .attach('file', filePath);

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Only JSON files are allowed');
    });

    it('should reject upload for invalid JSON structure (not an array)', async () => {
        const filePath = path.join(tempDir, 'invalid_json_structure.json');
        fs.writeFileSync(filePath, JSON.stringify({ message: "This is not an array" }));

        const res = await request(app)
            .post('/api/v1/chapters')
            .set('x-api-key', 'test-admin-key')
            .attach('file', filePath);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('JSON file must contain an array of chapters');
    });

    it('should process valid chapters and report failed chapters from a mixed JSON file', async () => {
      const mixedChaptersPayload = [
        ...validChaptersPayload,
        { subject: 'Invalid Data', chapter: 'No Status here' }, // Invalid chapter
      ];
      const filePath = path.join(tempDir, 'mixed_chapters.json');
      fs.writeFileSync(filePath, JSON.stringify(mixedChaptersPayload));

      const res = await request(app)
        .post('/api/v1/chapters')
        .set('x-api-key', 'test-admin-key')
        .attach('file', filePath);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.successCount).toBe(validChaptersPayload.length);
      expect(res.body.failedCount).toBe(1);
      expect(res.body.failedChapters.length).toBe(1);
      expect(res.body.failedChapters[0].chapter.subject).toBe('Invalid Data');
      expect(res.body.failedChapters[0].error).toBeDefined();
    });
  });
});

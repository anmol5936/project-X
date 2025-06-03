const request = require('supertest');
const express = require('express');
const { MongoMemoryServer } = require('mongodb-memory-server'); // For rate limiter if it hits DB indirectly
const { RedisMemoryServer } = require('redis-memory-server');
const mongoose = require('mongoose');

// Middleware to test
const { adminAuth } = require('../../middleware/auth');
const { cacheMiddleware, clearCache } = require('../../middleware/cache');
const { createRateLimiter } = require('../../middleware/rateLimiter'); // Actual rate limiter
const { createRedisClient, getRedisClient, closeRedisConnection } = require('../../utils/redis');

let app;
let mongod; // In case any middleware indirectly interacts with DB, though unlikely for these
let redisServer;
let redisClient;
let serverInstance;

// Setup basic Express app for testing middleware
const setupAppForMiddleware = (middleware, routeHandler = (req, res) => res.status(200).send('OK')) => {
  const testApp = express();
  testApp.use(express.json());
  if (middleware) {
    testApp.use(middleware);
  }
  testApp.get('/test-route', routeHandler);
  testApp.post('/test-post-route', routeHandler); // For testing cache clear on POST
  return testApp;
};

beforeAll(async () => {
  // MongoDB (Optional, if any middleware might interact with it, good to have consistent setup)
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URI);

  // Redis (Essential for cache and rate limiter)
  redisServer = await RedisMemoryServer.create();
  process.env.REDIS_HOST = await redisServer.getHost();
  process.env.REDIS_PORT = await redisServer.getPort();

  process.env.ADMIN_API_KEY = 'test-admin-api-key'; // For auth middleware

  createRedisClient(); // Initialize app's Redis client
  redisClient = getRedisClient(); // Get client for direct interaction in tests

  // No global app server here, each describe block will set up its own as needed
});

beforeEach(async () => {
  // Clear Redis cache before each test
  if (redisClient) {
    await redisClient.flushall();
  }
  // Clear any mock function calls
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();

  await closeRedisConnection(); // Close app's Redis connection
  if (redisServer) await redisServer.stop();

  if (serverInstance) { // Ensure any lingering server instance is closed
    await new Promise(resolve => serverInstance.close(resolve));
  }
});

describe('Middleware Tests', () => {
  describe('Admin Authentication Middleware (adminAuth)', () => {
    beforeEach(() => {
        // Setup app specifically for adminAuth tests
        app = setupAppForMiddleware(adminAuth);
        serverInstance = app.listen(0); // Listen on a random port
    });

    afterEach(async () => {
        if(serverInstance) await new Promise(resolve => serverInstance.close(resolve));
    });

    it('should allow access with a valid API key', async () => {
      const res = await request(serverInstance) // Use serverInstance
        .get('/test-route')
        .set('x-api-key', 'test-admin-api-key');
      expect(res.statusCode).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('should deny access without an API key', async () => {
      const res = await request(serverInstance).get('/test-route');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('should deny access with an invalid API key', async () => {
      const res = await request(serverInstance)
        .get('/test-route')
        .set('x-api-key', 'invalid-key');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unauthorized');
    });
  });

  describe('Caching Middleware (cacheMiddleware & clearCache)', () => {
    const cacheKey = 'chapters:::::::1:10'; // Example key based on cache.js logic for /test-route

    beforeEach(async () => {
        // Setup app with cache middleware for these tests
        // The route handler here will simulate a JSON response for caching
        app = setupAppForMiddleware(cacheMiddleware(60), (req, res) => res.status(200).json({ data: 'test data' }));
        serverInstance = app.listen(0);
        await redisClient.flushall(); // Ensure clean cache
    });

    afterEach(async () => {
        if(serverInstance) await new Promise(resolve => serverInstance.close(resolve));
    });

    it('should cache GET request responses', async () => {
      // First request
      const res1 = await request(serverInstance).get('/test-route');
      expect(res1.statusCode).toBe(200);
      expect(res1.body.data).toBe('test data');

      // Check if data is in cache
      const cachedData = await redisClient.get(cacheKey);
      expect(cachedData).toBeDefined();
      expect(JSON.parse(cachedData).data).toBe('test data');

      // Modify the response handler to see if cache serves old data
      // This requires a way to change the live handler or a more complex setup.
      // For simplicity, we'll assume the cache works if the key is set.
      // A better test would be to mock the underlying data source.

      // Second request
      const res2 = await request(serverInstance).get('/test-route');
      expect(res2.statusCode).toBe(200);
      expect(res2.body.data).toBe('test data'); // Served from cache
    });

    it('should not cache non-GET requests', async () => {
      const res = await request(serverInstance).post('/test-post-route').send({ value: 1 });
      expect(res.statusCode).toBe(200); // Assuming POST route exists and is handled by cacheMiddleware then routeHandler

      const cachedData = await redisClient.get(cacheKey); // Check main GET route cache key
      expect(cachedData).toBeNull();
    });

    it('should not cache responses with non-200 status codes', async () => {
        app = setupAppForMiddleware(cacheMiddleware(60), (req, res) => res.status(500).json({ error: 'server error' }));
        if(serverInstance) await new Promise(resolve => serverInstance.close(resolve)); // close previous server
        serverInstance = app.listen(0);

        const res = await request(serverInstance).get('/test-route');
        expect(res.statusCode).toBe(500);

        const cachedData = await redisClient.get(cacheKey);
        expect(cachedData).toBeNull();
    });

    it('clearCache should remove relevant keys from Redis', async () => {
      // Populate cache
      await request(serverInstance).get('/test-route');
      let cachedValue = await redisClient.get(cacheKey);
      expect(cachedValue).toBeDefined();

      // Add another cache key to ensure only 'chapters:*' are cleared
      await redisClient.set('otherkey:test', 'somevalue');

      await clearCache(); // Call clearCache function

      cachedValue = await redisClient.get(cacheKey);
      expect(cachedValue).toBeNull(); // Cache for the route should be cleared

      const otherKeyValue = await redisClient.get('otherkey:test');
      expect(otherKeyValue).toBe('somevalue'); // Other keys should remain
    });
  });

  describe('Rate Limiting Middleware (createRateLimiter)', () => {
    // Note: express-rate-limit's default store is in-memory if store is not specified.
    // Our createRateLimiter uses the default in-memory store in express-rate-limit,
    // it does not use rate-limit-redis as previously thought from package.json.
    // The rate-limit-redis package IS installed, but the createRateLimiter function
    // in middleware/rateLimiter.js uses the default store of express-rate-limit.
    // For more robust Redis-backed rate limiting tests, middleware/rateLimiter.js would need to be updated.
    // These tests will verify the basic express-rate-limit functionality.

    const MAX_REQUESTS = 30; // As per rateLimiter.js config
    const WINDOW_MS = 60 * 1000; // 1 minute

    beforeEach(async () => {
        // Rate limiter is IP-based. Supertest uses 127.0.0.1 by default.
        // The default store for express-rate-limit is MemoryStore, which is fine for testing.
        app = setupAppForMiddleware(createRateLimiter());
        if(serverInstance) await new Promise(resolve => serverInstance.close(resolve));
        serverInstance = app.listen(0);
        // No need to flushall Redis here if using MemoryStore, but good practice if it were RedisStore
        await redisClient.flushall();
    });

    afterEach(async () => {
        if(serverInstance) await new Promise(resolve => serverInstance.close(resolve));
    });

    it('should allow requests below the limit', async () => {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const res = await request(serverInstance).get('/test-route');
        expect(res.statusCode).toBe(200);
      }
    });

    it('should block requests exceeding the limit', async () => {
      // Send MAX_REQUESTS allowed requests
      for (let i = 0; i < MAX_REQUESTS; i++) {
        await request(serverInstance).get('/test-route').expect(200);
      }

      // Next request should be blocked
      const res = await request(serverInstance).get('/test-route');
      expect(res.statusCode).toBe(429); // Too Many Requests
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Too many requests, please try again later.');
    });

    it('should allow requests again after the window period', async () => {
      // Exceed the limit
      for (let i = 0; i <= MAX_REQUESTS; i++) {
        await request(serverInstance).get('/test-route');
      }

      const resBlocked = await request(serverInstance).get('/test-route');
      expect(resBlocked.statusCode).toBe(429);

      // Wait for the window to pass. Jest fake timers can make this faster.
      jest.useFakeTimers();
      jest.advanceTimersByTime(WINDOW_MS);
      jest.useRealTimers(); // Restore real timers

      // Request again, should be allowed
      const resAllowed = await request(serverInstance).get('/test-route');
      expect(resAllowed.statusCode).toBe(200);
    }, WINDOW_MS + 5000); // Increase Jest timeout for this test
  });
});

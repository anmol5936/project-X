const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { adminAuth } = require('../../middleware/auth');
const { cacheMiddleware, clearCache } = require('../../middleware/cache');
const { createRateLimiter } = require('../../middleware/rateLimiter');
const dbHandler = require('../../utils/db-handler');

// Mock API key for testing
process.env.ADMIN_API_KEY = 'test-admin-key';

let app;
let redisClient;

beforeAll(async () => {
  await dbHandler.connect();
  redisClient = dbHandler.getRedisClient();
  
  app = express();
  app.use(express.json());
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('Admin Authentication Middleware (adminAuth)', () => {
  let adminProtectedRoute;
  
  beforeEach(() => {
    // Setup a fresh app instance for each test
    adminProtectedRoute = express.Router();
    adminProtectedRoute.get('/admin-protected', adminAuth, (req, res) => {
      res.status(200).json({ message: 'Access granted' });
    });
    
    app.use(adminProtectedRoute);
  });
  
  test('should allow access with a valid API key', async () => {
    const response = await request(app)
      .get('/admin-protected')
      .set('x-api-key', 'test-admin-key');
      
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe('Access granted');
  });
  
  test('should deny access without an API key', async () => {
    const response = await request(app)
      .get('/admin-protected');
      
    expect(response.statusCode).toBe(401);
    expect(response.body.error).toBeTruthy();
  });
  
  test('should deny access with an invalid API key', async () => {
    const response = await request(app)
      .get('/admin-protected')
      .set('x-api-key', 'invalid-key');
      
    expect(response.statusCode).toBe(401);
    expect(response.body.error).toBeTruthy();
  });
});

describe('Caching Middleware (cacheMiddleware & clearCache)', () => {
  let cachedRoute;
  let requestCounter = 0;
  
  beforeEach(() => {
    // Reset counter
    requestCounter = 0;
    
    // Setup a fresh route for testing caching
    cachedRoute = express.Router();
    
    cachedRoute.get('/cached-data', cacheMiddleware, (req, res) => {
      requestCounter++;
      res.status(200).json({ 
        data: 'Test data', 
        counter: requestCounter 
      });
    });
    
    cachedRoute.post('/update-data', clearCache, (req, res) => {
      res.status(200).json({ message: 'Cache cleared' });
    });
    
    cachedRoute.get('/error-route', cacheMiddleware, (req, res) => {
      res.status(500).json({ error: 'Server error' });
    });
    
    app.use(cachedRoute);
  });
  
  test('should cache GET request responses', async () => {
    // First request - should hit the handler
    const firstResponse = await request(app).get('/cached-data');
    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body.counter).toBe(1);
    
    // Second request - should be cached
    const secondResponse = await request(app).get('/cached-data');
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.body.counter).toBe(1); // Counter shouldn't increment
    
    // Different route - shouldn't affect cache
    const differentResponse = await request(app).get('/cached-data?param=different');
    expect(differentResponse.statusCode).toBe(200);
    expect(differentResponse.body.counter).toBe(2); // New counter value
  });
  
  test('should not cache non-GET requests', async () => {
    // First GET to set up cache
    await request(app).get('/cached-data');
    
    // POST request should not be cached
    await request(app).post('/cached-data').send({ data: 'test' });
    
    // Next GET should still hit handler
    const response = await request(app).get('/cached-data');
    expect(response.body.counter).toBe(2);
  });
  
  test('should not cache responses with non-200 status codes', async () => {
    // First request - error route
    await request(app).get('/error-route');
    
    // Second request - should still hit handler
    await request(app).get('/error-route');
    
    // Counter should be 2 if both requests hit handler
    expect(requestCounter).toBe(2);
  });
  
  test('clearCache should remove relevant keys from Redis', async () => {
    // Set up cache
    await request(app).get('/cached-data');
    
    // Clear cache with POST request
    await request(app).post('/update-data');
    
    // Next GET should hit handler again
    const response = await request(app).get('/cached-data');
    expect(response.body.counter).toBe(2);
  });
});

describe('Rate Limiting Middleware (createRateLimiter)', () => {
  let rateLimitedRoute;
  const rateLimiter = createRateLimiter({
    windowMs: 1000, // 1 second
    max: 2, // limit each IP to 2 requests per windowMs
    keyGenerator: () => 'test-key' // Use same key for all tests
  });
  
  beforeEach(async () => {
    // Set up a fresh route with rate limiting
    rateLimitedRoute = express.Router();
    
    rateLimitedRoute.get(
      '/rate-limited', 
      rateLimiter,
      (req, res) => {
        res.status(200).json({ message: 'Success' });
      }
    );
    
    app.use(rateLimitedRoute);
    
    // Clear rate limit data between tests
    if (redisClient) {
      await redisClient.del('rate-limit:test-key');
    }
  });
  
  test('should allow requests below the limit', async () => {
    // First request
    const response1 = await request(app).get('/rate-limited');
    expect(response1.statusCode).toBe(200);
    
    // Second request - still under limit
    const response2 = await request(app).get('/rate-limited');
    expect(response2.statusCode).toBe(200);
  });
  
  test('should block requests exceeding the limit', async () => {
    // First two requests - under limit
    await request(app).get('/rate-limited');
    await request(app).get('/rate-limited');
    
    // Third request - should be blocked
    const response3 = await request(app).get('/rate-limited');
    expect(response3.statusCode).toBe(429);
  });
  
  test('should allow requests again after the window period', async () => {
    // First two requests - under limit
    await request(app).get('/rate-limited');
    await request(app).get('/rate-limited');
    
    // Wait for rate limit window to reset
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should be allowed again
    const response = await request(app).get('/rate-limited');
    expect(response.statusCode).toBe(200);
  });
});
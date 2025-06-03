const { rateLimit } = require('express-rate-limit');
const Redis = require('ioredis');
const { createRedisClient } = require('../utils/redis');

/**
 * Rate limiting middleware
 * Limits requests to 30 per minute per IP address
 */
const createRateLimiter = () => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.'
    },
    // Using memory store instead of Redis store due to compatibility issues
    skipFailedRequests: false
  });
};

module.exports = { createRateLimiter };
const { rateLimit } = require('express-rate-limit');
const Redis = require('ioredis');
const { createRedisClient } = require('../utils/redis');


const createRateLimiter = () => {
  return rateLimit({
    windowMs: 60 * 1000, 
    max: 30, 
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.'
    },
    
    skipFailedRequests: false
  });
};

module.exports = { createRateLimiter };
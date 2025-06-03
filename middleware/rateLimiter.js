const { rateLimit } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { createRedisClient } = require('../utils/redis');

const createRateLimiter = () => {
  const redisClient = createRedisClient();
  
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.'
    },
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
    skipFailedRequests: false
  });
};

module.exports = { createRateLimiter };
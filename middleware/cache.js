const { getRedisClient } = require('../utils/redis');

/**
 * Caching middleware for GET requests
 * @param {number} ttl - Time to live in seconds (default: 3600s = 1 hour)
 */
const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const redisClient = getRedisClient();
    
    // Create a unique cache key based on the URL and query parameters
    const params = req.query;
    const cacheKey = `chapters:${params.class || ''}:${params.unit || ''}:${params.status || ''}:${params.weakChapters || ''}:${params.subject || ''}:${params.page || '1'}:${params.limit || '10'}`;
    
    try {
      // Try to get cached data
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        // Return cached data
        return res.status(200).json(JSON.parse(cachedData));
      }

      // Store the original send method
      const originalSend = res.send;
      
      // Override the send method
      res.send = function(body) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          // Store data in Redis with TTL
          redisClient.setex(cacheKey, ttl, body);
        }
        
        // Call the original send method
        return originalSend.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Clear cache when data is updated
 */
const clearCache = async () => {
  try {
    const redisClient = getRedisClient();
    const keys = await redisClient.keys('chapters:*');
    
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Clear cache error:', error);
  }
};

module.exports = { cacheMiddleware, clearCache };
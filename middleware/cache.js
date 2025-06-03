const { getRedisClient } = require('../utils/redis');


const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    
    if (req.method !== 'GET') {
      return next();
    }

    const redisClient = getRedisClient();
    
    
    const params = req.query;
    const cacheKey = `chapters:${params.class || ''}:${params.unit || ''}:${params.status || ''}:${params.weakChapters || ''}:${params.subject || ''}:${params.page || '1'}:${params.limit || '10'}`;
    
    try {
      
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        
        return res.status(200).json(JSON.parse(cachedData));
      }

      
      const originalSend = res.send;
      
      
      res.send = function(body) {
        
        if (res.statusCode === 200) {
          
          redisClient.setex(cacheKey, ttl, body);
        }
        
        
        return originalSend.call(this, body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};


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
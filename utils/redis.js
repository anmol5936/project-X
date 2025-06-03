const Redis = require('ioredis');

let redisClient = null;

const createRedisClient = () => {
  if (!redisClient) {
    // Use REDIS_URL if available, otherwise fall back to individual host/port
    if (process.env.REDIS_URL) {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryDelayOnFailover: 100,
        lazyConnect: true,
      });
    } else {
      // Fallback for local development
      const redisOptions = {
        host: process.env.REDIS_HOST || '127.0.0.1', 
        port: process.env.REDIS_PORT || 6379,       
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      };
      redisClient = new Redis(redisOptions);
    }

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });
  }

  return redisClient;
};

const getRedisClient = () => {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
};

const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('Redis connection closed');
  }
};

module.exports = {
  createRedisClient,
  getRedisClient,
  closeRedisConnection
};
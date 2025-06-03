const Redis = require('ioredis');

let redisClient = null;

/**
 * Create a new Redis client
 * @returns {Redis} Redis client
 */
const createRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });
  }

  return redisClient;
};

/**
 * Get the Redis client instance
 * @returns {Redis} Redis client
 */
const getRedisClient = () => {
  if (!redisClient) {
    return createRedisClient();
  }
  return redisClient;
};

/**
 * Close the Redis connection
 */
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
const Redis = require('ioredis');

let redisClient = null;

/**
 * Create a new Redis client
 * @returns {Redis} Redis client
 */
const createRedisClient = () => {
  if (!redisClient) {
    const redisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1', // Default to localhost if not set
      port: process.env.REDIS_PORT || 6379,       // Default to 6379 if not set
      // Add other options like password if needed from process.env
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    };
    redisClient = new Redis(redisOptions);

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
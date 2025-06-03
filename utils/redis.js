const Redis = require('ioredis');

let redisClient = null;


const createRedisClient = () => {
  if (!redisClient) {
    const redisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1', 
      port: process.env.REDIS_PORT || 6379,       
      
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
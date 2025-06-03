const { MongoMemoryServer } = require('mongodb-memory-server');
const { RedisMemoryServer } = require('redis-memory-server');
const mongoose = require('mongoose');
const { createRedisClient, closeRedisConnection, getRedisClient } = require('../utils/redis');

let mongod;
let redisServer;
let redisClient;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  process.env.MONGO_URI = mongoUri; // Set MONGO_URI for the application to use the in-memory server

  redisServer = await RedisMemoryServer.create();
  const redisHost = await redisServer.getHost();
  const redisPort = await redisServer.getPort();
  process.env.REDIS_HOST = redisHost;
  process.env.REDIS_PORT = redisPort;

  // Initialize Redis client for setup/teardown
  createRedisClient(); // This will use the process.env variables we just set
  redisClient = getRedisClient();

  // Connect mongoose to the in-memory MongoDB
  await mongoose.connect(mongoUri);
});

beforeEach(async () => {
  // Clear all collections in MongoDB
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }

  // Clear Redis cache
  if (redisClient) {
    await redisClient.flushall();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }

  // Close the application's Redis connection
  await closeRedisConnection();

  if (redisServer) {
    await redisServer.stop();
  }
});

// Optionally, you can expose the redisClient if tests need to directly interact with it
module.exports = {
  getTestRedisClient: () => redisClient
};

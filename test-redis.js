// test-redis.js
require('dotenv').config();
const Redis = require('ioredis');

const testRedis = async () => {
  console.log('🔄 Testing Redis Cloud connection...\n');
  
  let redis;
  
  try {
    // Create Redis connection
    redis = new Redis(process.env.REDIS_URL);
    
    // Test 1: Connection
    console.log('1. Testing connection...');
    await redis.ping();
    console.log('✅ Connection successful!\n');
    
    // Test 2: Set and Get
    console.log('2. Testing SET/GET operations...');
    await redis.set('test:hello', 'Redis Cloud is working!');
    const value = await redis.get('test:hello');
    console.log(`✅ SET/GET successful: ${value}\n`);
    
    // Test 3: Hash operations
    console.log('3. Testing HASH operations...');
    await redis.hset('test:user', 'name', 'John', 'age', '30');
    const userData = await redis.hgetall('test:user');
    console.log('✅ HASH operations successful:', userData, '\n');
    
    // Test 4: List operations
    console.log('4. Testing LIST operations...');
    await redis.lpush('test:list', 'item1', 'item2', 'item3');
    const listItems = await redis.lrange('test:list', 0, -1);
    console.log('✅ LIST operations successful:', listItems, '\n');
    
    // Test 5: Expiration
    console.log('5. Testing expiration...');
    await redis.setex('test:expire', 5, 'This will expire');
    const ttl = await redis.ttl('test:expire');
    console.log(`✅ Expiration set: TTL = ${ttl} seconds\n`);
    
    // Clean up
    console.log('6. Cleaning up test data...');
    await redis.del('test:hello', 'test:user', 'test:list', 'test:expire');
    console.log('✅ Cleanup complete\n');
    
    console.log('🎉 All Redis tests passed! Your cloud Redis is working perfectly.');
    
  } catch (error) {
    console.error('❌ Redis test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    if (redis) {
      await redis.quit();
      console.log('🔌 Redis connection closed');
    }
  }
};

// Run the test
testRedis();
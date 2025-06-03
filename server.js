const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { createRateLimiter } = require('./middleware/rateLimiter');
const { createRedisClient, closeRedisConnection } = require('./utils/redis');
const chaptersRoutes = require('./routes/chapters');


dotenv.config();


const app = express();


createRedisClient();


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });


app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));


app.use(createRateLimiter());


app.use('/api/v1/chapters', chaptersRoutes);


app.get('/', (req, res) => {
  res.json({ 
    message: 'Chapter Performance Dashboard API',
    version: '1.0.0',
    endpoints: {
      chapters: '/api/v1/chapters'
    }
  });
});


app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found' 
  });
});


app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    success: false,
    message: err.message || 'Internal server error' 
  });
});


const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});


process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  
  server.close(() => process.exit(1));
});


process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully');
  await closeRedisConnection();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
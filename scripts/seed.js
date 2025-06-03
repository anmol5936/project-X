const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Chapter } = require('../models/chapter');

// Load env variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

/**
 * Seed the database with initial data
 */
const seedDatabase = async () => {
  try {
    // Read the JSON data file
    const dataPath = path.join(__dirname, '../data/all_subjects_chapter_data.json');
    const jsonData = fs.readFileSync(dataPath, 'utf8');
    const chapters = JSON.parse(jsonData);

    console.log(`Found ${chapters.length} chapters in the data file`);

    // Clear existing data
    await Chapter.deleteMany({});
    console.log('Cleared existing chapters from database');

    // Insert new data
    const result = await Chapter.insertMany(chapters);
    console.log(`Successfully added ${result.length} chapters to the database`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');

    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seeding function
seedDatabase();
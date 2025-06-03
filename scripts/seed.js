const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Chapter } = require('../models/chapter');


dotenv.config();


mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });


const seedDatabase = async () => {
  try {
  
    const dataPath = path.join(__dirname, '../data/all_subjects_chapter_data.json');
    const jsonData = fs.readFileSync(dataPath, 'utf8');
    const chapters = JSON.parse(jsonData);

    console.log(`Found ${chapters.length} chapters in the data file`);

   
    await Chapter.deleteMany({});
    console.log('Cleared existing chapters from database');

    
    const result = await Chapter.insertMany(chapters);
    console.log(`Successfully added ${result.length} chapters to the database`);

   
    await mongoose.disconnect();
    console.log('MongoDB disconnected');

    console.log('Database seeding completed successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
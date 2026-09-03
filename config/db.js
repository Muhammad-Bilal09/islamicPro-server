const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/islamicpro', {
      serverSelectionTimeoutMS: 2500, 
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(`MongoDB Connection Warning: ${error.message}`);
    console.log(`Falling back to a local JSON file database for development (data/users.json).`);
  }
};

const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

module.exports = { connectDB, isConnected };

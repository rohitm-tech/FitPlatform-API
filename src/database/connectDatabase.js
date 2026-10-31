import mongoose from 'mongoose';
import { config } from '../config/env.js';

export const connectDatabase = async () => {
  try {
    const connectionInstance = await mongoose.connect(config.MONGODB_URI);
    console.log(`\n🍃 MongoDB connected! DB HOST: ${connectionInstance.connection.host}`);
    return connectionInstance;
  } catch (error) {
    console.error('❌ MongoDB connection FAILED:', error);
    throw error;
  }
};

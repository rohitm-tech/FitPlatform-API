import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();
if(process.env.NODE_ENV==='production'&&(!process.env.JWT_SECRET||!process.env.MONGODB_URI))throw new Error('Production requires JWT_SECRET and MONGODB_URI');

const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set. Some functionality may be limited.`);
  }
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. AI features will be disabled.');
}

const parseCorsOrigins = (corsOrigin) => {
  if (!corsOrigin) {
    return ['http://localhost:5174'];
  }

  if (corsOrigin === '*' || corsOrigin.toLowerCase() === 'all') {
    return true;
  }

  return corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const config = {
  PORT: process.env.PORT || 3002,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/fitplatform',
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: parseCorsOrigins(process.env.CORS_ORIGIN),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5174',
  ADMIN_SEED_EMAIL: process.env.ADMIN_SEED_EMAIL || 'admin@fitplatform.app',
  ADMIN_SEED_PASSWORD: process.env.ADMIN_SEED_PASSWORD || 'ChangeMe123!',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  KIOSK_SESSION_TTL_MINUTES: Number(process.env.KIOSK_SESSION_TTL_MINUTES) || 2,
  KIOSK_PAIRING_CODE_TTL_MINUTES: Number(process.env.KIOSK_PAIRING_CODE_TTL_MINUTES) || 10,
};

if (config.NODE_ENV !== 'test') {
  console.log('Environment configuration loaded:', {
    PORT: config.PORT,
    NODE_ENV: config.NODE_ENV,
    CORS_ORIGIN: config.CORS_ORIGIN === true ? 'ALL ORIGINS' : config.CORS_ORIGIN,
    JWT_SECRET: config.JWT_SECRET ? 'SET' : 'NOT SET',
    MONGODB_URI: config.MONGODB_URI ? 'SET' : 'NOT SET',
    GEMINI_API_KEY: config.GEMINI_API_KEY ? 'SET' : 'NOT SET',
    FRONTEND_URL: config.FRONTEND_URL,
  });
}

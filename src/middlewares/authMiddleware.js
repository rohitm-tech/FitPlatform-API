import jwt from 'jsonwebtoken';
import { User } from '../models/userModel.js';
import { config } from '../config/env.js';

// Reads the cookie first (the SPA's actual transport), then falls back to a
// Bearer header for future non-browser clients (kiosk devices, a future
// React Native app).
export const verifyJWT = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized request - No token provided',
      });
    }

    const decodedToken = jwt.verify(token, config.JWT_SECRET || 'default_secret');
    const user = await User.findById(decodedToken._id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid access token',
    });
  }
};

// Attaches req.user if a valid token is present, but never rejects — used on
// routes that behave differently for a logged-in caller without requiring
// auth to read at all.
export const optionalAuth = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    const decodedToken = jwt.verify(token, config.JWT_SECRET || 'default_secret');
    const user = await User.findById(decodedToken._id).select('-passwordHash');
    if (user) req.user = user;
  } catch {
    // ignore invalid/expired token on optional routes
  }
  next();
};

import { config } from '../config/env.js';

export const errorMiddleware = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let errors = error.errors || [];

  if (error.name === 'ValidationError') {
    statusCode = 400;
    errors = Object.values(error.errors).map((e) => e.message);
    message = 'Validation failed';
  } else if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    message = `${field} already exists`;
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${error.path}`;
  }

  if (statusCode >= 500) {
    console.error('Global Error Handler:', error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
    ...(config.NODE_ENV === 'development' && statusCode >= 500 ? { stack: error.stack } : {}),
  });
};

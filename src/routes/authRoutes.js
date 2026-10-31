import {z} from 'zod';
import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  forgotPassword,
} from '../controllers/authController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { authRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import { validateBody, registerSchema, loginSchema } from '../validations/schemas.js';

const router = Router();

router.route('/register').post(authRateLimiter, validateBody(registerSchema), registerUser);
router.route('/login').post(authRateLimiter, validateBody(loginSchema), loginUser);
router.route('/forgot-password').post(authRateLimiter, validateBody(z.object({email:z.string().email()})), forgotPassword);
router.route('/logout').post(verifyJWT, logoutUser);
router.route('/me').get(verifyJWT, getCurrentUser);

export default router;

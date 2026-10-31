import { Router } from 'express';
import { completeOnboarding, exportMyData, deleteMyAccount } from '../controllers/userController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { validateBody, onboardingSchema } from '../validations/schemas.js';

const router = Router();

router.use(verifyJWT);
router.route('/onboarding').post(validateBody(onboardingSchema), completeOnboarding);
router.route('/me/export').get(exportMyData);
router.route('/me').delete(deleteMyAccount);

export default router;

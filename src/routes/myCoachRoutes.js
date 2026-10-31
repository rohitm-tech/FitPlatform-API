import { Router } from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody, coachMessageSchema } from '../validations/schemas.js';
import { getMyCoach, listMyCoachMessages, sendToMyCoach } from '../controllers/coachMessageController.js';

const router = Router();

router.use(verifyJWT, requireRole('athlete'));

router.get('/', getMyCoach);
router.get('/messages', listMyCoachMessages);
router.post('/messages', validateBody(coachMessageSchema), sendToMyCoach);

export default router;

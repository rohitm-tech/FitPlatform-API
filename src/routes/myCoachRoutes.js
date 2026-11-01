import { Router } from 'express';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { validateBody, coachMessageSchema } from '../validations/schemas.js';
import {
  getMyCoach,
  listMyCoachMessages,
  listPaidCoachMessages,
  sendPaidCoachMessage,
  sendToMyCoach,
} from '../controllers/coachMessageController.js';

const router = Router();

router.use(verifyJWT, requireRole('athlete'));

router.get('/', getMyCoach);
router.get('/messages', listMyCoachMessages);
router.post('/messages', validateBody(coachMessageSchema), sendToMyCoach);
router.get('/chats/:coachId/messages', listPaidCoachMessages);
router.post('/chats/:coachId/messages', validateBody(coachMessageSchema), sendPaidCoachMessage);

export default router;

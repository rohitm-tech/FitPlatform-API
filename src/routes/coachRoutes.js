import { Router } from 'express';
import { listMyAthletes, inviteAthlete, exploreAthletes, offerToTrain, athleteDashboard } from '../controllers/coachController.js';
import { listTemplates, createTemplate, assignTemplate } from '../controllers/workoutTemplateController.js';
import { listAthleteMessages, sendToAthlete } from '../controllers/coachMessageController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import { requireCoachOwnsAthlete, requireCoachChatAccess } from '../middlewares/ownershipMiddleware.js';
import {
  validateBody,
  coachMessageSchema,
  inviteAthleteSchema,
  coachOfferSchema,
  createTemplateSchema,
  assignTemplateSchema,
} from '../validations/schemas.js';

const router = Router();

router.use(verifyJWT, requireRole('coach'));

router.get('/explore', exploreAthletes);
router.post('/explore/:athleteId/offer', validateBody(coachOfferSchema), offerToTrain);
router.get('/athletes/:athleteId/dashboard', requireCoachOwnsAthlete, athleteDashboard);
router.get('/athletes', listMyAthletes);
router.post('/athletes/invite', validateBody(inviteAthleteSchema), inviteAthlete);
router.get('/athletes/:athleteId/messages', requireCoachChatAccess, listAthleteMessages);
router.post(
  '/athletes/:athleteId/messages',
  requireCoachChatAccess,
  validateBody(coachMessageSchema),
  sendToAthlete
);

router.get('/templates', listTemplates);
router.post('/templates', validateBody(createTemplateSchema), createTemplate);
router.post('/templates/:templateId/assign', validateBody(assignTemplateSchema), assignTemplate);

export default router;

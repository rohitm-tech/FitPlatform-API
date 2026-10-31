import { Router } from 'express';
import { listMyAthletes, inviteAthlete } from '../controllers/coachController.js';
import { listTemplates, createTemplate, assignTemplate } from '../controllers/workoutTemplateController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/roleMiddleware.js';
import {
  validateBody,
  inviteAthleteSchema,
  createTemplateSchema,
  assignTemplateSchema,
} from '../validations/schemas.js';

const router = Router();

router.use(verifyJWT, requireRole('coach'));

router.get('/athletes', listMyAthletes);
router.post('/athletes/invite', validateBody(inviteAthleteSchema), inviteAthlete);

router.get('/templates', listTemplates);
router.post('/templates', validateBody(createTemplateSchema), createTemplate);
router.post('/templates/:templateId/assign', validateBody(assignTemplateSchema), assignTemplate);

export default router;

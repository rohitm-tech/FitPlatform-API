import { Router } from 'express';
import {
  getHome,
  listWorkouts,
  createWorkout,
  updateWorkout,
  logWorkout,
  listWorkoutLogs,
  getInsights,
  createCheckIn,
} from '../controllers/athleteController.js';
import { listComments, createComment } from '../controllers/commentController.js';
import { verifyJWT } from '../middlewares/authMiddleware.js';
import { requireSelfOrCoach } from '../middlewares/ownershipMiddleware.js';
import {
  validateBody,
  createWorkoutSchema,
  updateWorkoutSchema,
  logWorkoutSchema,
  createCommentSchema,
} from '../validations/schemas.js';

const router = Router({ mergeParams: true });

router.use('/:athleteId', verifyJWT, requireSelfOrCoach);

router.get('/:athleteId/home', getHome);
router.get('/:athleteId/workouts', listWorkouts);
router.post('/:athleteId/workouts', validateBody(createWorkoutSchema), createWorkout);
router.patch('/:athleteId/workouts/:workoutId', validateBody(updateWorkoutSchema), updateWorkout);
router.post('/:athleteId/logs', validateBody(logWorkoutSchema), logWorkout);
router.get('/:athleteId/logs', listWorkoutLogs);
router.get('/:athleteId/insights', getInsights);
router.post('/:athleteId/checkins', createCheckIn);

router.get('/:athleteId/comments', listComments);
router.post('/:athleteId/comments', validateBody(createCommentSchema), createComment);

export default router;

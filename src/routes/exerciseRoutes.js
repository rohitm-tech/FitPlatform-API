import { Router } from 'express';
import { listExercises, getExerciseBySlug } from '../controllers/exerciseController.js';

const router = Router();

router.get('/', listExercises);
router.get('/:slug', getExerciseBySlug);

export default router;

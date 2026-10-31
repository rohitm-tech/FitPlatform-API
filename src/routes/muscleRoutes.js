import { Router } from 'express';
import { listMuscles, getMuscleByKey } from '../controllers/muscleController.js';

const router = Router();

router.get('/', listMuscles);
router.get('/:key', getMuscleByKey);

export default router;

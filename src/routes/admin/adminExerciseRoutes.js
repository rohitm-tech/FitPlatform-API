import { Router } from 'express';
import { createExercise, updateExercise, deleteExercise } from '../../controllers/admin/adminExerciseController.js';
import { verifyJWT } from '../../middlewares/authMiddleware.js';
import { requireRole } from '../../middlewares/roleMiddleware.js';
import { validateBody, exerciseSchema } from '../../validations/schemas.js';

const router = Router();

router.use(verifyJWT, requireRole('admin'));

router.post('/', validateBody(exerciseSchema), createExercise);
router.patch('/:id', validateBody(exerciseSchema.partial()), updateExercise);
router.delete('/:id', deleteExercise);

export default router;

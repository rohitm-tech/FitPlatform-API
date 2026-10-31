import { Router } from 'express';
import { createMuscle, updateMuscle, deleteMuscle } from '../../controllers/admin/adminMuscleController.js';
import { verifyJWT } from '../../middlewares/authMiddleware.js';
import { requireRole } from '../../middlewares/roleMiddleware.js';
import { validateBody, muscleSchema } from '../../validations/schemas.js';

const router = Router();

router.use(verifyJWT, requireRole('admin'));

router.post('/', validateBody(muscleSchema), createMuscle);
router.patch('/:id', updateMuscle);
router.delete('/:id', deleteMuscle);

export default router;

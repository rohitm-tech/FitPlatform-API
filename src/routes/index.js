import { Router } from 'express';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import muscleRoutes from './muscleRoutes.js';
import exerciseRoutes from './exerciseRoutes.js';
import athleteRoutes from './athleteRoutes.js';
import adminMuscleRoutes from './admin/adminMuscleRoutes.js';
import adminExerciseRoutes from './admin/adminExerciseRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/muscles', muscleRoutes);
router.use('/exercises', exerciseRoutes);
router.use('/athletes', athleteRoutes);
router.use('/admin/muscles', adminMuscleRoutes);
router.use('/admin/exercises', adminExerciseRoutes);

// Phase 4+: coachRoutes
// Phase 5+: gymRoutes, kioskRoutes
// Phase 6+: aiRoutes

export default router;

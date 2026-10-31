import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  roles: z.array(z.enum(['athlete', 'coach', 'gym_owner'])).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const onboardingSchema = z.object({
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.coerce.date().optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  goal: z.enum(['muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'race']).optional(),
  trainingDaysPerWeek: z.number().min(1).max(7).optional(),
  equipmentAccess: z.array(z.string()).optional(),
  injuries: z.string().optional(),
  bodyModelPreference: z.enum(['male', 'female']).optional(),
});

export const muscleSchema = z.object({
  key: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  group: z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']),
  description: z.string().optional(),
  meshNames: z.array(z.string()).optional(),
});

export const exerciseSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  primaryMuscles: z.array(z.string()).min(1, 'At least one primary muscle is required'),
  secondaryMuscles: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  instructions: z.array(z.string()).optional(),
  videoUrl: z.string().optional().nullable(),
  type: z.enum(['strength', 'cardio', 'mobility']).optional(),
});

const workoutItemSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().min(1),
  reps: z.number().min(1),
  targetWeightKg: z.number().nullable().optional(),
  restSec: z.number().optional(),
  notes: z.string().optional(),
});

export const createWorkoutSchema = z.object({
  date: z.coerce.date(),
  title: z.string().trim().min(1),
  items: z.array(workoutItemSchema).default([]),
});

export const updateWorkoutSchema = z.object({
  date: z.coerce.date().optional(),
  title: z.string().trim().min(1).optional(),
  items: z.array(workoutItemSchema).optional(),
  status: z.enum(['planned', 'completed', 'skipped']).optional(),
});

const setLogSchema = z.object({
  reps: z.number().min(0),
  weightKg: z.number().min(0),
});

export const logWorkoutSchema = z.object({
  workoutId: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  items: z
    .array(
      z.object({
        exerciseId: z.string(),
        sets: z.array(setLogSchema),
      })
    )
    .min(1),
  durationMin: z.number().min(0).optional(),
  perceivedEffort: z.number().min(1).max(10).nullable().optional(),
  painFlag: z.boolean().optional(),
  notes: z.string().optional(),
});

export const createCommentSchema = z.object({
  workoutId: z.string().nullable().optional(),
  workoutLogId: z.string().nullable().optional(),
  text: z.string().trim().min(1),
});

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => issue.message),
    });
  }
  req.body = result.data;
  next();
};

import { z } from 'zod';
import { SPORTS } from '../constants/sports.js';
import { kindForSport } from '../constants/sessionSports.js';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  roles: z.array(z.enum(['athlete', 'coach', 'gym_owner'])).max(1).optional(),
  gymName: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.coerce.date().optional(),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  goal: z.enum(['muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'race']).optional(),
  trainingDaysPerWeek: z.number().int().min(1).max(7).optional(),
  equipmentAccess: z.array(z.string()).optional(),
  injuries: z.string().max(2000).optional(),
  shareDetailedLogs: z.boolean().optional(),
  bodyModelPreference: z.enum(['male', 'female']).optional(),
  location: z
    .object({
      city: z.string().trim().max(60).default(''),
      area: z.string().trim().max(80).default(''),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    })
    .nullable()
    .optional(),
  sports: z.array(z.enum(SPORTS)).max(SPORTS.length).optional(),
  about: z.string().trim().max(1000).optional(),
  trainingSetting: z.enum(['in_person', 'online', 'either']).optional(),
  budgetMonthlyInr: z.number().int().min(0).max(1000000).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
  availability: z.string().trim().max(200).optional(),
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

const legacyWorkoutItemSchema = z.object({
  exerciseId: z.string(),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(1000),
  targetWeightKg: z.number().min(0).max(1500).nullable().optional(),
  restSec: z.number().int().min(0).max(600).optional(),
  notes: z.string().optional(),
});

const strengthItemSchema = z.object({
  kind: z.literal('strength'),
  exerciseId: z.string(),
  label: z.string().trim().max(80).optional(),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(1000),
  targetWeightKg: z.number().min(0).max(1500).nullable().optional(),
  restSec: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(300).optional(),
});

const swimItemSchema = z.object({
  kind: z.literal('swim'),
  label: z.string().trim().min(1).max(80),
  stroke: z.string().trim().min(1).max(40),
  sets: z.number().int().min(1).max(100),
  distanceM: z.number().int().min(1).max(10000),
  restSec: z.number().int().min(0).max(600).optional(),
  paceSec: z.number().int().min(1).max(600).nullable().optional(),
  notes: z.string().max(300).optional(),
});

const enduranceItemSchema = z
  .object({
    kind: z.literal('endurance'),
    label: z.string().trim().min(1).max(80),
    sets: z.number().int().min(1).max(100),
    distanceM: z.number().int().min(0).max(200000).nullable().optional(),
    durationSec: z.number().int().min(0).max(86400).nullable().optional(),
    restSec: z.number().int().min(0).max(3600).optional(),
    notes: z.string().max(300).optional(),
  })
  .refine((item) => (item.distanceM || 0) > 0 || (item.durationSec || 0) > 0, {
    message: 'Add a distance or a duration',
  });

const stationItemSchema = z
  .object({
    kind: z.literal('station'),
    label: z.string().trim().min(1).max(80),
    metric: z.enum(['reps', 'distance', 'time']),
    sets: z.number().int().min(1).max(50).optional(),
    reps: z.number().int().min(0).max(1000).nullable().optional(),
    distanceM: z.number().min(0).max(100000).nullable().optional(),
    durationSec: z.number().int().min(0).max(7200).nullable().optional(),
    targetWeightKg: z.number().min(0).max(500).nullable().optional(),
    restSec: z.number().int().min(0).max(600).optional(),
    notes: z.string().max(300).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.metric === 'reps' && !(item.reps > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the reps for this station', path: ['reps'] });
    }
    if (item.metric === 'distance' && !(item.distanceM > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a distance for this station', path: ['distanceM'] });
    }
    if (item.metric === 'time' && !(item.durationSec > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a time for this station', path: ['durationSec'] });
    }
  });

const roundsItemSchema = z.object({
  kind: z.literal('rounds'),
  label: z.string().trim().min(1).max(80),
  sets: z.number().int().min(1).max(30),
  durationSec: z.number().int().min(10).max(1800),
  restSec: z.number().int().min(0).max(600),
  notes: z.string().max(300).optional(),
});

const practiceItemSchema = z.object({
  kind: z.literal('practice'),
  label: z.string().trim().min(1).max(80),
  durationSec: z.number().int().min(60).max(14400),
  effort: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(500).optional(),
});

const sessionItemSchema = z.union([
  strengthItemSchema,
  swimItemSchema,
  enduranceItemSchema,
  stationItemSchema,
  roundsItemSchema,
  practiceItemSchema,
]);

const workoutItemSchema = z.union([sessionItemSchema, legacyWorkoutItemSchema]);

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
  reps: z.number().int().min(0).max(1000).optional(),
  weightKg: z.number().min(0).max(1500).optional(),
  distanceM: z.number().min(0).max(200000).optional(),
  durationSec: z.number().int().min(0).max(86400).optional(),
});

export const logWorkoutSchema = z.object({
  workoutId: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  items: z
    .array(
      z
        .object({
          exerciseId: z.string().optional(),
          label: z.string().trim().max(80).optional(),
          kind: z.enum(['strength', 'swim', 'endurance', 'station', 'rounds', 'practice']).optional(),
          sets: z.array(setLogSchema).default([]),
        })
        .refine((item) => Boolean(item.exerciseId || item.label?.trim()), {
          message: 'Each logged piece needs an exercise or a name',
        }),
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

export const coachMessageSchema = z.object({
  text: z.string().trim().min(1, 'Write a message first').max(2000, 'Keep messages under 2000 characters'),
});

export const inviteAthleteSchema = z.object({
  email: z.string().trim().email(),
  sport: z.enum(SPORTS),
});

export const coachOfferSchema = z.object({
  text: z.string().trim().min(1, 'Write a short offer').max(500),
  sport: z.enum(SPORTS),
});

export const coachFollowUpSchema = z.object({
  text: z.string().trim().min(1, 'Write a follow-up').max(500),
});

export const createTemplateSchema = z
  .object({
    title: z.string().trim().min(1),
    sport: z.enum(SPORTS),
    items: z.array(sessionItemSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const expected = kindForSport(value.sport);
    value.items.forEach((item, index) => {
      if (item.kind !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${value.sport} sessions use ${expected} measurements`,
          path: ['items', index, 'kind'],
        });
      }
    });
  });

export const assignTemplateSchema = z.object({
  athleteIds: z.array(z.string()).min(1),
  dates: z.array(z.coerce.date()).min(1),
});
export const kioskPairSchema=z.object({code:z.string().length(6)});
export const kioskLoginSchema=z.object({deviceId:z.string().min(1),deviceToken:z.string().min(20),email:z.string().email(),pin:z.string().regex(/^\d{4}$/)});
export const kioskPinSchema=z.object({pin:z.string().regex(/^\d{4}$/)});

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

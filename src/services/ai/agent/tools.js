import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Exercise } from '../../../models/exerciseModel.js';
import { Muscle } from '../../../models/muscleModel.js';
import { upsertDailyRecovery } from '../../performanceService.js';

const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

const today = () => new Date().toISOString().slice(0, 10);

// Built per chat turn so each tool can push into this turn's own trace/cards
// arrays — the caller persists both onto the assistant message afterward.
export function buildCoachTools(athleteId, trace, cards) {
  const search_exercises = tool(
    async ({ muscle, equipment, difficulty, type, query, limit }) => {
      const filter = {};
      if (muscle) {
        const key = muscle.trim().toLowerCase();
        const muscleDocs = await Muscle.find(
          MUSCLE_GROUPS.includes(key)
            ? { group: key }
            : { $or: [{ key }, { displayName: new RegExp(muscle, 'i') }] }
        ).select('_id');
        if (muscleDocs.length) filter.primaryMuscles = { $in: muscleDocs.map((m) => m._id) };
      }
      if (equipment) filter.equipment = equipment;
      if (difficulty) filter.difficulty = difficulty;
      if (type) filter.type = type;
      if (query) filter.$text = { $search: query };

      const exercises = await Exercise.find(filter)
        .populate('primaryMuscles', 'displayName')
        .select('name slug difficulty equipment primaryMuscles')
        .limit(Math.min(limit || 6, 8));

      const results = exercises.map((e) => ({
        exerciseId: String(e._id),
        name: e.name,
        slug: e.slug,
        difficulty: e.difficulty,
        equipment: e.equipment,
        primaryMuscle: e.primaryMuscles[0]?.displayName || null,
      }));

      cards.push(...results);
      trace.push({
        tool: 'search_exercises',
        label: `Searched the exercise library${muscle ? ` for ${muscle}` : ''}${results.length ? ` — found ${results.length}` : ' — no matches'}`,
        status: 'done',
      });

      if (!results.length) return 'No matching exercises were found in the library. Try a broader muscle group or drop the equipment/difficulty filter.';
      return JSON.stringify(results.map(({ name, difficulty, equipment, primaryMuscle }) => ({ name, difficulty, equipment, primaryMuscle })));
    },
    {
      name: 'search_exercises',
      description:
        'Search the real exercise library (100+ exercises) by target muscle, equipment, difficulty or type. Always use this when the athlete asks about workouts, exercises, or which movements target a muscle — never name exercises from memory. Results are shown to the athlete as cards, so your reply only needs to introduce them briefly, not list every detail.',
      schema: z.object({
        muscle: z
          .string()
          .optional()
          .describe('A muscle group (chest, back, legs, shoulders, arms, core) or a specific muscle (e.g. biceps, quadriceps)'),
        equipment: z.enum(['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'plate']).optional(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        type: z.enum(['strength', 'cardio', 'mobility']).optional(),
        query: z.string().optional().describe('Free-text search on the exercise name'),
        limit: z.number().int().min(1).max(8).optional(),
      }),
    }
  );

  const log_recovery = tool(
    async ({ date, sleepHours, sleepMinutes, restingHeartRate, hrvMs, steps, fatigue, soreness, notes }) => {
      const day = date || today();
      const data = { date: day };
      const minutes = sleepMinutes ?? (sleepHours != null ? Math.round(sleepHours * 60) : undefined);
      if (minutes != null) data.sleepMinutes = minutes;
      if (restingHeartRate != null) data.restingHeartRate = restingHeartRate;
      if (hrvMs != null) data.hrvMs = hrvMs;
      if (steps != null) data.steps = steps;
      if (fatigue != null) data.fatigue = fatigue;
      if (soreness != null) data.soreness = soreness;
      if (notes) data.notes = notes;

      if (Object.keys(data).length <= 1) {
        return 'No measurable value was given — ask the athlete for at least one number (sleep, resting heart rate, HRV, steps, fatigue or soreness) before calling this again.';
      }

      const record = await upsertDailyRecovery(athleteId, data, 'manual', 'Logged via AI coach');
      const parts = [];
      if (record.sleepMinutes != null) parts.push(`${Math.floor(record.sleepMinutes / 60)}h ${record.sleepMinutes % 60}m sleep`);
      if (record.restingHeartRate != null) parts.push(`${record.restingHeartRate} bpm resting HR`);
      if (record.hrvMs != null) parts.push(`${record.hrvMs} ms HRV`);
      if (record.steps != null) parts.push(`${record.steps} steps`);
      if (record.fatigue != null) parts.push(`fatigue ${record.fatigue}/10`);
      if (record.soreness != null) parts.push(`soreness ${record.soreness}/10`);

      trace.push({ tool: 'log_recovery', label: `Logged ${day}: ${parts.join(', ') || 'check-in'}`, status: 'done' });
      return `Saved for ${day}: ${parts.join(', ')}.`;
    },
    {
      name: 'log_recovery',
      description:
        "Save a recovery or wearable measurement the athlete reports in conversation: sleep, resting heart rate, HRV, step count, fatigue (1-10) or soreness (1-10). Call this immediately whenever the athlete states a number for any of these — don't just acknowledge it in words. Defaults to today if no date is given.",
      schema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, defaults to today'),
        sleepHours: z.number().min(0).max(24).optional(),
        sleepMinutes: z.number().int().min(0).max(1440).optional(),
        restingHeartRate: z.number().min(25).max(220).optional(),
        hrvMs: z.number().min(1).max(400).optional(),
        steps: z.number().int().min(0).max(200000).optional(),
        fatigue: z.number().int().min(1).max(10).optional().describe('1 = very fresh, 10 = extremely fatigued'),
        soreness: z.number().int().min(1).max(10).optional(),
        notes: z.string().max(1000).optional(),
      }),
    }
  );

  return [search_exercises, log_recovery];
}

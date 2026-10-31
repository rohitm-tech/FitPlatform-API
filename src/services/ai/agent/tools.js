import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Exercise } from '../../../models/exerciseModel.js';
import { Muscle } from '../../../models/muscleModel.js';
import { upsertDailyRecovery } from '../../performanceService.js';
import { User } from '../../../models/userModel.js';
import { PLACE_KINDS, SPORTS, normalizeSport } from '../../../constants/sports.js';
import { updateAthleteProfile } from '../../athleteProfileService.js';
import { findCoachMatches, findPlaceMatches, formatInr } from '../../coachMatchService.js';
import { summarizeLifeLog } from '../../lifeLogService.js';

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
        type: 'exercise',
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

  const loadAthlete = () => User.findById(athleteId).select('name profile').lean();

  const save_athlete_details = tool(
    async ({ city, area, sports, about, trainingSetting, budgetMonthlyInr, languages, availability, goal, experienceLevel, trainingDaysPerWeek }) => {
      const updates = {};
      if (city || area) updates.location = { city: city || '', area: area || '' };
      if (sports?.length) {
        const known = [...new Set(sports.map(normalizeSport).filter(Boolean))];
        if (known.length) {
          const current = (await loadAthlete())?.profile?.sports || [];
          updates.sports = [...new Set([...current, ...known])];
        }
      }
      if (about) updates.about = about;
      if (trainingSetting) updates.trainingSetting = trainingSetting;
      if (budgetMonthlyInr != null) updates.budgetMonthlyInr = budgetMonthlyInr;
      if (languages?.length) updates.languages = languages;
      if (availability) updates.availability = availability;
      if (goal) updates.goal = goal;
      if (experienceLevel) updates.experienceLevel = experienceLevel;
      if (trainingDaysPerWeek) updates.trainingDaysPerWeek = trainingDaysPerWeek;
      if (!Object.keys(updates).length) return 'Nothing to save — no recognisable detail was given.';

      const user = await updateAthleteProfile(athleteId, updates, { source: 'chat' });
      const p = user.profile;
      const saved = [];
      if (updates.location) {
        saved.push(
          p.location.latitude != null
            ? `location ${[p.location.area, p.location.city].filter(Boolean).join(', ')}`
            : `location "${[p.location.area, p.location.city].filter(Boolean).join(', ')}" (not in the catalogue's cities, so distances are unavailable)`,
        );
      }
      if (updates.sports) saved.push(`sports ${p.sports.join(', ')}`);
      if (updates.trainingSetting) saved.push(`prefers ${p.trainingSetting.replace('_', ' ')}`);
      if (updates.budgetMonthlyInr != null) saved.push(`budget ₹${p.budgetMonthlyInr}/month`);
      if (updates.languages) saved.push(`languages ${p.languages.join(', ')}`);
      if (updates.availability) saved.push(`availability ${p.availability}`);
      if (updates.about) saved.push('about');
      if (updates.goal) saved.push(`goal ${p.goal}`);
      if (updates.experienceLevel) saved.push(`level ${p.experienceLevel}`);
      if (updates.trainingDaysPerWeek) saved.push(`${p.trainingDaysPerWeek} days/week`);
      trace.push({ tool: 'save_athlete_details', label: `Saved to your profile: ${saved.join('; ')}`, status: 'done' });
      return `Saved: ${saved.join('; ')}.`;
    },
    {
      name: 'save_athlete_details',
      description:
        "Save personal details the athlete tells you so future searches use them: where they live (city and neighbourhood), sports they do, coaching preferences (in person / online), monthly coaching budget in rupees, languages, availability, goal, experience level, or a short 'about' summary. Call it as soon as they share any of these, before searching.",
      schema: z.object({
        city: z.string().max(60).optional().describe('City, e.g. Bengaluru, Mumbai, Pune'),
        area: z.string().max(80).optional().describe('Neighbourhood, e.g. HSR Layout, Bandra West'),
        sports: z.array(z.string().max(40)).max(10).optional().describe('Sports they do or want to do, e.g. swimming, HYROX, yoga'),
        about: z
          .string()
          .max(1000)
          .optional()
          .describe('Short third-person summary of what they have told you about themselves, merged with the existing summary'),
        trainingSetting: z.enum(['in_person', 'online', 'either']).optional(),
        budgetMonthlyInr: z.number().int().min(0).max(1000000).optional(),
        languages: z.array(z.string().max(30)).max(8).optional(),
        availability: z.string().max(200).optional().describe('e.g. weekday mornings, weekends'),
        goal: z.enum(['muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'race']).optional(),
        experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        trainingDaysPerWeek: z.number().int().min(1).max(7).optional(),
      }),
    }
  );

  const find_coaches = tool(
    async ({ sport, city, area, setting, budgetMonthlyInr, language, query, maxKm, limit }) => {
      const athlete = await loadAthlete();
      const catalogueSport = sport ? normalizeSport(sport) : null;
      if (sport && !catalogueSport) {
        trace.push({ tool: 'find_coaches', label: `No coaches listed for “${sport}”`, status: 'done' });
        return `The platform has no coaches for "${sport}". Sports on the platform: ${SPORTS.join(', ')}.`;
      }
      const location = athlete?.profile?.location || {};
      const knowsLocation = city || area || location.latitude != null || location.city;
      if (!knowsLocation && (setting || athlete?.profile?.trainingSetting) !== 'online') {
        trace.push({ tool: 'find_coaches', label: 'Needs your location before searching', status: 'done' });
        return "The athlete's location is unknown. Ask which city and neighbourhood they live or train in (or whether online coaching is fine), save it with save_athlete_details, then search again.";
      }

      const result = await findCoachMatches(athlete, { sport: catalogueSport, city, area, setting, budgetMonthlyInr, language, query, maxKm, limit });
      cards.push(...result.matches);
      const near = result.searched.near ? ` near ${result.searched.near}` : '';
      trace.push({
        tool: 'find_coaches',
        label: `Searched ${catalogueSport || 'all'} coaches${near}${result.matches.length ? ` — found ${result.total}` : ' — no matches'}`,
        status: 'done',
      });
      if (!result.matches.length) {
        return `No ${catalogueSport || ''} coaches match${near} (searched ${result.searched.maxKm} km, setting ${result.searched.setting}). Suggest online coaching, a different area, or a related sport.`;
      }
      return JSON.stringify({
        searched: result.searched,
        totalMatches: result.total,
        shownAsCards: result.matches.map((m) => ({
          name: m.name,
          sport: m.sport,
          headline: m.headline,
          summary: m.summary,
          area: m.area,
          distanceKm: m.distanceKm,
          delivery: m.delivery,
          price: m.priceMinor != null ? `${formatInr(m.priceMinor)} per ${m.priceUnit}` : 'not listed',
          experienceYears: m.experienceYears,
          languages: m.languages,
          whyRecommended: m.reasons,
          cautions: m.cautions,
          matchScore: m.matchScore,
        })),
      });
    },
    {
      name: 'find_coaches',
      description:
        "Find real coaches on the platform for any sport (gym/strength, swimming, running, HYROX, CrossFit, yoga, pilates, boxing, martial arts, climbing, tennis, badminton, cricket, football, cycling, dance, triathlon and more), ranked for this athlete by distance from where they live, budget, language, goal and experience. Uses the athlete's saved location unless you pass city/area. Results are shown as coach cards with a summary and reasons, so your reply should briefly recommend the best fit and why, not repeat every field. Never invent coaches.",
      schema: z.object({
        sport: z.string().max(40).optional().describe('Sport in plain words, e.g. swimming, HYROX, boxing, gym'),
        city: z.string().max(60).optional().describe('Only when the athlete names a place other than their saved location'),
        area: z.string().max(80).optional(),
        setting: z.enum(['in_person', 'online', 'either']).optional(),
        budgetMonthlyInr: z.number().int().min(0).max(1000000).optional(),
        language: z.string().max(30).optional(),
        query: z.string().max(60).optional().describe('A specific need, e.g. "beginners", "open water", "race prep"'),
        maxKm: z.number().min(1).max(50).optional().describe('Travel radius, default 15 km'),
        limit: z.number().int().min(1).max(5).optional().describe('How many coach cards, default 3'),
      }),
    }
  );

  const find_places = tool(
    async ({ sport, kind, city, area, maxKm, limit }) => {
      const athlete = await loadAthlete();
      const catalogueSport = sport ? normalizeSport(sport) : null;
      const result = await findPlaceMatches(athlete, { sport: catalogueSport, kind, city, area, maxKm, limit });
      cards.push(...result.matches);
      const near = result.searched.near ? ` near ${result.searched.near}` : '';
      trace.push({
        tool: 'find_places',
        label: `Searched ${catalogueSport || kind || ''} venues${near}${result.matches.length ? ` — found ${result.total}` : ' — no matches'}`.replace('  ', ' '),
        status: 'done',
      });
      if (!result.matches.length) return `No venues match${near} within ${result.searched.maxKm} km.`;
      return JSON.stringify(
        result.matches.map((p) => ({
          name: p.name,
          kind: p.kind,
          sport: p.sport,
          area: p.area,
          distanceKm: p.distanceKm,
          price: p.priceMinor === 0 ? 'free' : `${formatInr(p.priceMinor)} per ${p.priceUnit}`,
          hours: p.hours,
        })),
      );
    },
    {
      name: 'find_places',
      description:
        'Find venues near the athlete: gyms, pools, HYROX/CrossFit boxes, yoga/pilates/dance studios, courts, climbing walls, combat gyms, turfs, cricket grounds and running tracks. Shown as cards. Uses the saved location unless you pass city/area.',
      schema: z.object({
        sport: z.string().max(40).optional(),
        kind: z.enum(PLACE_KINDS).optional(),
        city: z.string().max(60).optional(),
        area: z.string().max(80).optional(),
        maxKm: z.number().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(6).optional(),
      }),
    }
  );

  const review_life_log = tool(
    async ({ from, to, days }) => {
      const summary = await summarizeLifeLog(athleteId, { from, to, days });
      if (summary.error) {
        trace.push({ tool: 'review_life_log', label: 'Could not read the life log', status: 'error' });
        return summary.error;
      }
      const food = summary.foodDays
        ? `${summary.foodDays} day${summary.foodDays === 1 ? '' : 's'} with food`
        : 'no food logged';
      const calories = summary.averages.calories
        ? `, ${summary.averages.calories.perLoggedDay.toLocaleString('en-IN')} kcal/day`
        : '';
      trace.push({
        tool: 'review_life_log',
        label: `Reviewed ${summary.label}: ${food}${calories}`,
        status: 'done',
      });
      cards.push({
        type: 'life',
        name: summary.label,
        headline: summary.loggedDays
          ? `${summary.loggedDays} of ${summary.spanDays} days logged`
          : 'Nothing logged in this stretch',
        summary: summary.cardLine || 'Food, water, weight, mood, sleep and training',
        href: '/athlete#dash-daylog-title',
      });
      const { cardLine, ...forModel } = summary;
      return JSON.stringify(forModel);
    },
    {
      name: 'review_life_log',
      description:
        "Read this athlete's own daily log for a timeframe they ask about: meals and calories, protein, carbs, fat, water, body weight, mood, energy, stress, sleep, resting heart rate, HRV, steps, fatigue, soreness, notes, and how many training sessions they completed. Use it for any question about food, calories, nutrition, or how they have been doing over today, a few days, weeks, or months. Pass days (for example 7, 21, 30, 90) or from/to as YYYY-MM-DD. Defaults to the last 14 days. Answer only with numbers this tool returns — never estimate a day that was not logged. A link to their log is shown automatically.",
      schema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(366)
          .optional()
          .describe('How many days ending at `to` (or today). Use 1 for today, 7 for a week, 21 for a few weeks, 30 for a month, 90 for a few months.'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('First day, YYYY-MM-DD, when they name a start date'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Last day, YYYY-MM-DD. Defaults to today'),
      }),
    }
  );

  return [search_exercises, log_recovery, review_life_log, save_athlete_details, find_coaches, find_places];
}

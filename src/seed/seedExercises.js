import { Exercise } from '../models/exerciseModel.js';
import { slugify } from '../utils/slugify.js';

// [name, primaryMuscleKeys[], secondaryMuscleKeys[], equipment[], difficulty, type]
const RAW = [
  ['Barbell Bench Press', ['middle-chest'], ['front-delts', 'triceps'], ['barbell'], 'intermediate', 'strength'],
  ['Incline Barbell Press', ['upper-chest'], ['front-delts', 'triceps'], ['barbell'], 'intermediate', 'strength'],
  ['Decline Barbell Press', ['lower-chest'], ['triceps'], ['barbell'], 'intermediate', 'strength'],
  ['Dumbbell Bench Press', ['middle-chest'], ['triceps', 'front-delts'], ['dumbbell'], 'beginner', 'strength'],
  ['Incline Dumbbell Press', ['upper-chest'], ['front-delts'], ['dumbbell'], 'beginner', 'strength'],
  ['Decline Dumbbell Press', ['lower-chest'], ['triceps'], ['dumbbell'], 'intermediate', 'strength'],
  ['Cable Crossover', ['middle-chest'], ['front-delts'], ['cable'], 'intermediate', 'strength'],
  ['Low-to-High Cable Fly', ['upper-chest'], ['front-delts'], ['cable'], 'intermediate', 'strength'],
  ['High-to-Low Cable Fly', ['lower-chest'], ['triceps'], ['cable'], 'intermediate', 'strength'],
  ['Dumbbell Fly', ['middle-chest'], ['front-delts'], ['dumbbell'], 'beginner', 'strength'],
  ['Pec Deck Machine', ['inner-chest'], ['front-delts'], ['machine'], 'beginner', 'strength'],
  ['Push-Up', ['middle-chest'], ['triceps', 'front-delts'], ['bodyweight'], 'beginner', 'strength'],
  ['Incline Push-Up', ['lower-chest'], ['triceps'], ['bodyweight'], 'beginner', 'strength'],
  ['Decline Push-Up', ['upper-chest'], ['front-delts'], ['bodyweight'], 'intermediate', 'strength'],
  ['Chest Dip', ['lower-chest'], ['triceps'], ['bodyweight'], 'intermediate', 'strength'],
  ['Machine Chest Press', ['middle-chest'], ['triceps'], ['machine'], 'beginner', 'strength'],
  ['Svend Press', ['inner-chest'], ['front-delts'], ['plate'], 'beginner', 'strength'],

  ['Pull-Up', ['lats'], ['upper-back', 'biceps'], ['bodyweight'], 'advanced', 'strength'],
  ['Chin-Up', ['lats'], ['biceps'], ['bodyweight'], 'intermediate', 'strength'],
  ['Lat Pulldown', ['lats'], ['biceps'], ['cable', 'machine'], 'beginner', 'strength'],
  ['Close-Grip Lat Pulldown', ['lats'], ['biceps'], ['cable'], 'beginner', 'strength'],
  ['Barbell Row', ['upper-back'], ['lats', 'biceps'], ['barbell'], 'intermediate', 'strength'],
  ['Pendlay Row', ['upper-back'], ['lats'], ['barbell'], 'advanced', 'strength'],
  ['T-Bar Row', ['upper-back'], ['lats'], ['barbell', 'machine'], 'intermediate', 'strength'],
  ['Seated Cable Row', ['rhomboids'], ['lats', 'biceps'], ['cable'], 'beginner', 'strength'],
  ['One-Arm Dumbbell Row', ['lats'], ['upper-back'], ['dumbbell'], 'beginner', 'strength'],
  ['Chest-Supported Row', ['rhomboids'], ['upper-back'], ['dumbbell'], 'beginner', 'strength'],
  ['Face Pull', ['rear-delts'], ['rhomboids'], ['cable'], 'beginner', 'strength'],
  ['Barbell Shrug', ['traps'], ['forearms'], ['barbell'], 'beginner', 'strength'],
  ['Dumbbell Shrug', ['traps'], ['forearms'], ['dumbbell'], 'beginner', 'strength'],
  ['Rack Pull', ['traps'], ['upper-back', 'hamstrings'], ['barbell'], 'advanced', 'strength'],
  ['Deadlift', ['hamstrings'], ['glutes', 'upper-back', 'traps'], ['barbell'], 'advanced', 'strength'],
  ['Good Morning', ['hamstrings'], ['glutes', 'upper-back'], ['barbell'], 'advanced', 'strength'],
  ['Straight-Arm Pulldown', ['lats'], ['triceps'], ['cable'], 'beginner', 'strength'],
  ['Superman', ['upper-back'], ['glutes'], ['bodyweight'], 'beginner', 'strength'],
  ['Dumbbell Reverse Fly', ['rear-delts'], ['rhomboids'], ['dumbbell'], 'beginner', 'strength'],
  ['Cable Reverse Fly', ['rear-delts'], ['rhomboids'], ['cable'], 'beginner', 'strength'],

  ['Overhead Barbell Press', ['front-delts'], ['triceps', 'side-delts'], ['barbell'], 'intermediate', 'strength'],
  ['Seated Dumbbell Press', ['front-delts'], ['side-delts', 'triceps'], ['dumbbell'], 'beginner', 'strength'],
  ['Arnold Press', ['front-delts'], ['side-delts'], ['dumbbell'], 'intermediate', 'strength'],
  ['Lateral Raise', ['side-delts'], ['traps'], ['dumbbell'], 'beginner', 'strength'],
  ['Cable Lateral Raise', ['side-delts'], ['traps'], ['cable'], 'beginner', 'strength'],
  ['Front Raise', ['front-delts'], ['side-delts'], ['dumbbell'], 'beginner', 'strength'],
  ['Machine Rear Delt Fly', ['rear-delts'], ['rhomboids'], ['machine'], 'beginner', 'strength'],
  ['Upright Row', ['side-delts'], ['traps'], ['barbell'], 'intermediate', 'strength'],
  ['Machine Shoulder Press', ['front-delts'], ['triceps'], ['machine'], 'beginner', 'strength'],
  ['Landmine Press', ['front-delts'], ['triceps'], ['barbell'], 'intermediate', 'strength'],

  ['Barbell Curl', ['biceps'], ['forearms'], ['barbell'], 'beginner', 'strength'],
  ['Dumbbell Curl', ['biceps'], ['forearms'], ['dumbbell'], 'beginner', 'strength'],
  ['Hammer Curl', ['forearms'], ['biceps'], ['dumbbell'], 'beginner', 'strength'],
  ['Incline Dumbbell Curl', ['biceps'], ['forearms'], ['dumbbell'], 'intermediate', 'strength'],
  ['Preacher Curl', ['biceps'], ['forearms'], ['barbell'], 'intermediate', 'strength'],
  ['Cable Curl', ['biceps'], ['forearms'], ['cable'], 'beginner', 'strength'],
  ['Concentration Curl', ['biceps'], ['forearms'], ['dumbbell'], 'beginner', 'strength'],
  ['Close-Grip Bench Press', ['triceps'], ['middle-chest'], ['barbell'], 'intermediate', 'strength'],
  ['Tricep Pushdown', ['triceps'], ['forearms'], ['cable'], 'beginner', 'strength'],
  ['Overhead Tricep Extension', ['triceps'], ['forearms'], ['dumbbell'], 'beginner', 'strength'],
  ['Skull Crusher', ['triceps'], ['forearms'], ['barbell'], 'intermediate', 'strength'],
  ['Tricep Dip', ['triceps'], ['front-delts'], ['bodyweight'], 'intermediate', 'strength'],
  ['Cable Overhead Extension', ['triceps'], ['forearms'], ['cable'], 'beginner', 'strength'],
  ['Wrist Curl', ['forearms'], ['biceps'], ['dumbbell'], 'beginner', 'strength'],
  ['Reverse Wrist Curl', ['forearms'], ['biceps'], ['dumbbell'], 'beginner', 'strength'],
  ["Farmer's Carry", ['forearms'], ['traps'], ['dumbbell'], 'beginner', 'strength'],

  ['Barbell Back Squat', ['quadriceps'], ['glutes', 'hamstrings'], ['barbell'], 'intermediate', 'strength'],
  ['Front Squat', ['quadriceps'], ['glutes'], ['barbell'], 'advanced', 'strength'],
  ['Goblet Squat', ['quadriceps'], ['glutes'], ['dumbbell'], 'beginner', 'strength'],
  ['Leg Press', ['quadriceps'], ['glutes', 'hamstrings'], ['machine'], 'beginner', 'strength'],
  ['Walking Lunge', ['quadriceps'], ['glutes'], ['dumbbell'], 'beginner', 'strength'],
  ['Bulgarian Split Squat', ['quadriceps'], ['glutes'], ['dumbbell'], 'intermediate', 'strength'],
  ['Leg Extension', ['quadriceps'], [], ['machine'], 'beginner', 'strength'],
  ['Romanian Deadlift', ['hamstrings'], ['glutes'], ['barbell'], 'intermediate', 'strength'],
  ['Lying Leg Curl', ['hamstrings'], ['calves'], ['machine'], 'beginner', 'strength'],
  ['Seated Leg Curl', ['hamstrings'], ['calves'], ['machine'], 'beginner', 'strength'],
  ['Hip Thrust', ['glutes'], ['hamstrings'], ['barbell'], 'beginner', 'strength'],
  ['Glute Bridge', ['glutes'], ['hamstrings'], ['bodyweight'], 'beginner', 'strength'],
  ['Cable Kickback', ['glutes'], ['hamstrings'], ['cable'], 'beginner', 'strength'],
  ['Standing Calf Raise', ['calves'], [], ['machine'], 'beginner', 'strength'],
  ['Seated Calf Raise', ['calves'], [], ['machine'], 'beginner', 'strength'],
  ['Donkey Calf Raise', ['calves'], [], ['bodyweight'], 'intermediate', 'strength'],
  ['Step-Up', ['quadriceps'], ['glutes'], ['dumbbell'], 'beginner', 'strength'],
  ['Sumo Deadlift', ['glutes'], ['hamstrings', 'quadriceps'], ['barbell'], 'advanced', 'strength'],

  ['Crunch', ['upper-abs'], [], ['bodyweight'], 'beginner', 'strength'],
  ['Cable Crunch', ['upper-abs'], [], ['cable'], 'beginner', 'strength'],
  ['Sit-Up', ['upper-abs'], ['lower-abs'], ['bodyweight'], 'beginner', 'strength'],
  ['Hanging Leg Raise', ['lower-abs'], ['obliques'], ['bodyweight'], 'advanced', 'strength'],
  ['Reverse Crunch', ['lower-abs'], [], ['bodyweight'], 'beginner', 'strength'],
  ['Plank', ['upper-abs'], ['lower-abs'], ['bodyweight'], 'beginner', 'strength'],
  ['Side Plank', ['obliques'], [], ['bodyweight'], 'beginner', 'strength'],
  ['Russian Twist', ['obliques'], ['upper-abs'], ['dumbbell'], 'beginner', 'strength'],
  ['Bicycle Crunch', ['obliques'], ['upper-abs'], ['bodyweight'], 'beginner', 'strength'],
  ['Cable Woodchopper', ['obliques'], ['upper-abs'], ['cable'], 'intermediate', 'strength'],
  ['Ab Wheel Rollout', ['upper-abs'], ['lower-abs'], ['bodyweight'], 'advanced', 'strength'],
  ['Mountain Climber', ['upper-abs'], ['lower-abs'], ['bodyweight'], 'beginner', 'strength'],

  ['Treadmill Run', ['quadriceps'], ['calves'], ['machine'], 'beginner', 'cardio'],
  ['Rowing Machine', ['lats'], ['biceps'], ['machine'], 'beginner', 'cardio'],
  ['Jump Rope', ['calves'], ['quadriceps'], ['bodyweight'], 'beginner', 'cardio'],
  ['Stationary Cycling', ['quadriceps'], ['hamstrings'], ['machine'], 'beginner', 'cardio'],
  ['Stair Climber', ['quadriceps'], ['glutes'], ['machine'], 'beginner', 'cardio'],
  ["World's Greatest Stretch", ['quadriceps'], ['obliques', 'hamstrings'], ['bodyweight'], 'beginner', 'mobility'],
  ['Cat-Cow Stretch', ['upper-back'], ['lower-abs'], ['bodyweight'], 'beginner', 'mobility'],
  ['90/90 Hip Stretch', ['glutes'], [], ['bodyweight'], 'beginner', 'mobility'],
];

export const seedExercises = async (muscleMap) => {
  let created = 0;
  for (const [name, primaryKeys, secondaryKeys, equipment, difficulty, type] of RAW) {
    const slug = slugify(name);
    const existing = await Exercise.findOne({ slug });
    if (existing) continue;

    const primaryMuscles = primaryKeys.map((key) => muscleMap[key]?._id).filter(Boolean);
    const secondaryMuscles = secondaryKeys.map((key) => muscleMap[key]?._id).filter(Boolean);

    await Exercise.create({
      name,
      slug,
      primaryMuscles,
      secondaryMuscles,
      equipment,
      difficulty,
      type,
      instructions: [
        `Set up for ${name.toLowerCase()} with a stable base and neutral spine.`,
        'Perform the movement under control through a full range of motion.',
        'Return to the start position and repeat for the prescribed reps.',
      ],
      videoUrl: null,
    });
    created += 1;
  }
  console.log(`  ✓ Seeded ${created} exercises (${RAW.length} total in library)`);
};

import { User } from '../models/userModel.js';
import { Gym } from '../models/gymModel.js';
import { GymMembership } from '../models/gymMembershipModel.js';
import { DEMO_ATHLETE_NAMES, DEMO_COACHES, DEMO_OWNER, upsertDemoUser as upsertUser } from './demoPeople.js';

const GYM_ADDRESS = '12th Main Road, Indiranagar, Bengaluru';

// Creates 1 gym owner + their gym, 2 coaches, and 10 athletes with varied
// profiles. Also creates a GymMembership per athlete so the gym dashboard
// (Phase 5) has attendance/member data to show from day one.
export const seedGymAndStaff = async () => {
  const owner = await upsertUser({
    ...DEMO_OWNER,
    passwordHash: 'Owner1234!',
    roles: ['gym_owner'],
  });

  let gym = await Gym.findOne({ ownerId: owner._id });
  if (!gym) {
    gym = await Gym.create({
      name: 'Ironclad Fitness',
      address: GYM_ADDRESS,
      ownerId: owner._id,
    });
    console.log(`  ✓ Seeded gym (${gym.name})`);
  } else {
    if (gym.address === '221B Baker Street, Springfield') {
      gym.address = GYM_ADDRESS;
      await gym.save();
    }
    console.log('  • Gym already exists, skipping');
  }

  if (!owner.gymId) {
    owner.gymId = gym._id;
    await owner.save();
  }

  const coaches = [];
  for (const seed of DEMO_COACHES) {
    const coach = await upsertUser({
      ...seed,
      passwordHash: 'Coach1234!',
      roles: ['coach'],
      gymId: gym._id,
    });
    coaches.push(coach);
  }
  console.log(`  ✓ Seeded ${coaches.length} coaches`);

  const athleteProfiles = [
    { goal: 'muscle_gain', experienceLevel: 'intermediate', trainingDaysPerWeek: 4 },
    { goal: 'fat_loss', experienceLevel: 'beginner', trainingDaysPerWeek: 3 },
    { goal: 'strength', experienceLevel: 'advanced', trainingDaysPerWeek: 5 },
    { goal: 'general_fitness', experienceLevel: 'beginner', trainingDaysPerWeek: 2 },
    { goal: 'race', experienceLevel: 'intermediate', trainingDaysPerWeek: 5 },
    { goal: 'muscle_gain', experienceLevel: 'beginner', trainingDaysPerWeek: 3 },
    { goal: 'fat_loss', experienceLevel: 'intermediate', trainingDaysPerWeek: 4 },
    { goal: 'strength', experienceLevel: 'intermediate', trainingDaysPerWeek: 4 },
    { goal: 'general_fitness', experienceLevel: 'advanced', trainingDaysPerWeek: 6 },
    { goal: 'muscle_gain', experienceLevel: 'advanced', trainingDaysPerWeek: 5 },
  ];

  const athletes = [];
  for (let i = 0; i < athleteProfiles.length; i += 1) {
    const n = i + 1;
    const profile = athleteProfiles[i];
    const athlete = await upsertUser({
      name: DEMO_ATHLETE_NAMES[i],
      email: `athlete${n}@fitplatform.app`,
      passwordHash: 'Athlete1234!',
      roles: ['athlete'],
      gymId: gym._id,
      onboardingCompleted: true,
      profile: {
        gender: n % 2 === 0 ? 'female' : 'male',
        heightCm: 160 + n,
        weightKg: 60 + n,
        experienceLevel: profile.experienceLevel,
        goal: profile.goal,
        trainingDaysPerWeek: profile.trainingDaysPerWeek,
        equipmentAccess: ['barbell', 'dumbbell', 'machine'],
      },
    });
    athletes.push(athlete);

    const existingMembership = await GymMembership.findOne({ gymId: gym._id, userId: athlete._id });
    if (!existingMembership) {
      await GymMembership.create({
        gymId: gym._id,
        userId: athlete._id,
        status: n === 10 ? 'expired' : 'active',
      });
    }
  }
  console.log(`  ✓ Seeded ${athletes.length} athletes with memberships`);

  return { owner, gym, coaches, athletes };
};

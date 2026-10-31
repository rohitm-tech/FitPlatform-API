import { CoachAthlete } from '../models/coachAthleteModel.js';

// Splits the 10 seeded athletes between the 2 coaches (5 each), with one
// athlete per coach left as "invited" (not yet active) to exercise that
// status in the coach dashboard.
export const seedCoachAthleteLinks = async (coaches, athletes) => {
  let created = 0;
  for (let i = 0; i < athletes.length; i += 1) {
    const coach = coaches[i % coaches.length];
    const athlete = athletes[i];
    const existing = await CoachAthlete.findOne({ coachId: coach._id, athleteId: athlete._id });
    if (existing) continue;

    await CoachAthlete.create({
      coachId: coach._id,
      athleteId: athlete._id,
      status: i < 2 ? 'invited' : 'active',
    });
    created += 1;
  }
  console.log(`  ✓ Seeded ${created} coach-athlete links`);
};

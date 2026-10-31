import { User } from '../models/userModel.js';

// Seeded demo people use Indian names. Emails stay stable because the
// sign-in screen's demo buttons and the README depend on them.
export const DEMO_OWNER = { name: 'Priya Shah', email: 'owner@fitplatform.app' };
export const DEMO_ADMIN_NAME = 'Rajiv Bhatia';
export const DEMO_COACHES = [
  { name: 'Manish Chauhan', email: 'coach1@fitplatform.app' },
  { name: 'Shalini Menon', email: 'coach2@fitplatform.app' },
];
// Odd numbers are seeded as male athletes and even numbers as female.
export const DEMO_ATHLETE_NAMES = [
  'Aarav Sharma',
  'Diya Patel',
  'Vihaan Reddy',
  'Saanvi Nair',
  'Arnav Gupta',
  'Myra Kapoor',
  'Reyansh Joshi',
  'Aadhya Bhatt',
  'Atharv Singh',
  'Anika Das',
];

// Earlier seeds used these placeholders. Only these exact names are
// replaced, so a name someone edited themselves is never overwritten.
const PLACEHOLDER = /^(Athlete \d+|Marcus Lee|Dana Ortiz|Rhythm Admin)$/;

/** Creates the user, or renames an existing one that still has a placeholder name. */
export async function upsertDemoUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (!existing) return User.create(data);
  if (PLACEHOLDER.test(existing.name) && existing.name !== data.name) {
    existing.name = data.name;
    await existing.save();
  }
  return existing;
}

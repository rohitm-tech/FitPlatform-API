import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/userModel.js';
import { Gym } from '../src/models/gymModel.js';
import { CoachAthlete } from '../src/models/coachAthleteModel.js';
import { requireRole } from '../src/middlewares/roleMiddleware.js';

const registerAndLogin = async (overrides = {}) => {
  const agent = request.agent(app);
  const email = overrides.email || `user-${Date.now()}-${Math.random()}@example.com`;
  await agent.post('/api/v1/auth/register').send({
    name: overrides.name || 'RBAC Test',
    email,
    password: 'Password123!',
  });
  if (overrides.roles) {
    await User.findOneAndUpdate({ email }, { roles: overrides.roles });
  }
  const user = await User.findOne({ email });
  return { agent, user };
};

describe('Role-based access', () => {
  it('requireRole throws 403 for a user missing the required role', () => {
    const middleware = requireRole('admin');
    const req = { user: { roles: ['athlete'] } };
    expect(() => middleware(req, {}, () => {})).toThrow(/Forbidden/);
  });

  it('requireRole calls next() when the user holds one of the allowed roles', () => {
    const middleware = requireRole('coach', 'admin');
    const req = { user: { roles: ['athlete', 'coach'] } };
    let nextCalled = false;
    middleware(req, {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it('requireRole throws 401 when there is no authenticated user', () => {
    const middleware = requireRole('admin');
    expect(() => middleware({}, {}, () => {})).toThrow(/Unauthorized/);
  });

  it('a user can hold multiple roles simultaneously', async () => {
    const { user } = await registerAndLogin({ roles: ['athlete', 'coach'] });
    expect(user.roles).toEqual(expect.arrayContaining(['athlete', 'coach']));
  });

  it('a coach can only be linked to athletes they actively coach (ownership check)', async () => {
    const { user: coach } = await registerAndLogin({ roles: ['coach'] });
    const { user: athleteA } = await registerAndLogin({ roles: ['athlete'] });
    const { user: athleteB } = await registerAndLogin({ roles: ['athlete'] });

    await CoachAthlete.create({ coachId: coach._id, athleteId: athleteA._id, status: 'active' });

    const linkedToA = await CoachAthlete.findOne({
      coachId: coach._id,
      athleteId: athleteA._id,
      status: 'active',
    });
    const linkedToB = await CoachAthlete.findOne({
      coachId: coach._id,
      athleteId: athleteB._id,
      status: 'active',
    });

    expect(linkedToA).not.toBeNull();
    expect(linkedToB).toBeNull();
  });

  it('a gym owner only owns the gym they created', async () => {
    const { user: ownerA } = await registerAndLogin({ roles: ['gym_owner'] });
    const { user: ownerB } = await registerAndLogin({ roles: ['gym_owner'] });
    const gym = await Gym.create({ name: 'Test Gym', ownerId: ownerA._id });

    expect(String(gym.ownerId)).toBe(String(ownerA._id));
    expect(String(gym.ownerId)).not.toBe(String(ownerB._id));
  });
});

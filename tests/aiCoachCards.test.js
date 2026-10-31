import { jest } from '@jest/globals';
import crypto from 'node:crypto';
import request from 'supertest';

const generate = jest.fn();
jest.unstable_mockModule('../src/services/ai/agent/graph.js', () => ({ runCoachAgent: (...args) => generate(...args) }));
const { default: app } = await import('../src/app.js');
const { User } = await import('../src/models/userModel.js');
const { AiThread } = await import('../src/models/aiThreadModel.js');

const coachCard = {
  type: 'coach',
  coachId: '64b000000000000000000001',
  name: 'Lane Coach',
  sport: 'Swimming',
  sports: ['Beginners'],
  headline: 'Calm water confidence.',
  summary: 'Patient adult lessons.',
  area: 'HSR Layout, Bengaluru',
  city: 'Bengaluru',
  distanceKm: 0.8,
  delivery: 'in_person',
  experienceYears: 8,
  priceMinor: 300000,
  priceUnit: 'month',
  remote: false,
  accepting: true,
  languages: ['English', 'Kannada'],
  reasons: ['Swimming is their main sport', '0.8 km from HSR Layout'],
  cautions: [],
  matchScore: 71,
  isDemo: true,
};

it('stores coach cards on the reply and feeds their names back as context next turn', async () => {
  const user = await User.create({ name: 'Card athlete', email: 'cards@test.app', passwordHash: 'Password123!', roles: ['athlete'] });
  const headers = { Authorization: `Bearer ${user.generateAccessToken()}` };
  const thread = (await request(app).post('/api/v1/ai/conversations').set(headers).send({})).body.data;

  generate.mockResolvedValueOnce({ answer: 'Lane Coach is your best fit.', cards: [coachCard], toolTrace: [{ tool: 'find_coaches', label: 'Searched', status: 'done' }] });
  const first = await request(app).post('/api/v1/ai/chat').set(headers)
    .send({ conversationId: thread._id, clientRequestId: crypto.randomUUID(), message: 'I swim, find me a coach' });
  expect(first.status).toBe(200);

  const saved = await AiThread.findById(thread._id).lean();
  expect(saved.messages[1].cards[0]).toMatchObject({
    type: 'coach',
    name: 'Lane Coach',
    distanceKm: 0.8,
    reasons: coachCard.reasons,
    delivery: 'in_person',
  });

  generate.mockResolvedValueOnce({ answer: 'They teach adults.', cards: [], toolTrace: [] });
  await request(app).post('/api/v1/ai/chat').set(headers)
    .send({ conversationId: thread._id, clientRequestId: crypto.randomUUID(), message: 'Tell me more about the first one' });
  const history = generate.mock.calls[1][0].history;
  expect(history.at(-1).text).toContain('[Cards shown: 1. Lane Coach (Swimming coach, HSR Layout, Bengaluru)]');
});

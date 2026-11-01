import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/userModel.js';
import { PlatformPricing } from '../src/models/platformPricingModel.js';
import { CommunityLike } from '../src/models/communityLikeModel.js';
import { EventRsvp } from '../src/models/eventRsvpModel.js';

const day = 24 * 60 * 60 * 1000;

async function person({ name, role = 'athlete', plan = 'free' }) {
  const email = `${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(16).slice(2)}@example.com`;
  const user = await User.create({
    name,
    email,
    passwordHash: 'Password123!',
    roles: [role],
    plan,
  });
  return { user, headers: { Authorization: `Bearer ${user.generateAccessToken()}` } };
}

function eventBody(overrides = {}) {
  const starts = Date.now() + 14 * day;
  return {
    title: 'Cubbon Park sunrise run',
    summary: 'An easy loop from the bandstand.',
    place: 'Cubbon Park, Bengaluru',
    startsAt: new Date(starts).toISOString(),
    endsAt: new Date(starts + 2 * 60 * 60 * 1000).toISOString(),
    publicOpensAt: new Date(Date.now() + 7 * day).toISOString(),
    capacity: 20,
    fullPriceMinor: 79900,
    premiumPriceMinor: 49900,
    status: 'published',
    ...overrides,
  };
}

describe('Community', () => {
  it('keeps the feed on Premium and lets a free athlete reply once they are in a thread', async () => {
    const premium = await person({ name: 'Aarav Sharma', plan: 'premium' });
    const free = await person({ name: 'Vihaan Reddy' });
    const coach = await person({ name: 'Manish Chauhan', role: 'coach' });

    const locked = await request(app).get('/api/v1/community/posts').set(free.headers);
    expect(locked.status).toBe(402);
    expect(locked.body.errors[0].code).toBe('upgrade');
    expect(locked.body.message).toMatch(/community/i);

    await request(app).get('/api/v1/community/posts').set(coach.headers).expect(403);
    await request(app).post('/api/v1/community/threads').set(free.headers).send({
      athleteId: premium.user._id.toString(),
      body: 'Can I start this?',
    }).expect(402);

    const post = await request(app)
      .post('/api/v1/community/posts')
      .set(premium.headers)
      .send({ body: 'Cubbon Park loop this Sunday, from the bandstand at 6:30.' });
    expect(post.status).toBe(201);

    const reply = await request(app)
      .post(`/api/v1/community/posts/${post.body.data._id}/replies`)
      .set(premium.headers)
      .send({ body: 'I will keep the first 5 km easy.' });
    expect(reply.status).toBe(201);

    const liked = await request(app)
      .post(`/api/v1/community/posts/${post.body.data._id}/like`)
      .set(premium.headers);
    expect(liked.body.data).toMatchObject({ liked: true, likeCount: 1 });
    expect(await CommunityLike.countDocuments({ postId: post.body.data._id })).toBe(1);

    const cleared = await request(app)
      .post(`/api/v1/community/posts/${post.body.data._id}/like`)
      .set(premium.headers);
    expect(cleared.body.data).toMatchObject({ liked: false, likeCount: 0 });
    expect(await CommunityLike.countDocuments({ postId: post.body.data._id })).toBe(0);

    const found = await request(app)
      .get('/api/v1/community/athletes')
      .query({ q: 'Vihaan' })
      .set(premium.headers);
    expect(found.body.data).toEqual([
      expect.objectContaining({ _id: free.user._id.toString(), name: 'Vihaan Reddy' }),
    ]);
    expect(found.body.data[0].email).toBeUndefined();

    const started = await request(app).post('/api/v1/community/threads').set(premium.headers).send({
      athleteId: free.user._id.toString(),
      body: 'Are you running on Sunday?',
    });
    expect(started.status).toBe(201);
    const threadId = started.body.data.thread._id;

    const answer = await request(app)
      .post(`/api/v1/community/threads/${threadId}/messages`)
      .set(free.headers)
      .send({ body: 'Yes, I will start with you.' });
    expect(answer.status).toBe(201);

    const inbox = await request(app).get('/api/v1/community/threads').set(free.headers);
    expect(inbox.body.data.threads).toHaveLength(1);
    expect(inbox.body.data.threads[0].other.name).toBe('Aarav Sharma');

    await request(app).post('/api/v1/community/threads').set(premium.headers).send({
      athleteId: coach.user._id.toString(),
      body: 'Coach?',
    }).expect(404);
  });

  it('adds the community feature to a saved plan without turning a switched-off feature back on', async () => {
    await PlatformPricing.create({
      key: 'default',
      currency: 'INR',
      plans: [
        { id: 'free', name: 'Free', priceMinor: 0, interval: 'month', features: [] },
        { id: 'premium', name: 'Premium', priceMinor: 79900, interval: 'month', features: [] },
      ],
    });
    const premium = await person({ name: 'Diya Patel', plan: 'premium' });
    await request(app).get('/api/v1/community/posts').set(premium.headers).expect(200);
    const saved = await PlatformPricing.findOne({ key: 'default' }).lean();
    const premiumPlan = saved.plans.find((plan) => plan.id === 'premium');
    const freePlan = saved.plans.find((plan) => plan.id === 'free');
    expect(premiumPlan.features.find((feature) => feature.key === 'community').included).toBe(true);
    expect(freePlan.features.find((feature) => feature.key === 'community').included).toBe(false);

    await PlatformPricing.deleteMany({});
    await PlatformPricing.create({
      key: 'default',
      currency: 'INR',
      plans: [
        {
          id: 'free',
          name: 'Free',
          priceMinor: 0,
          interval: 'month',
          features: [{ key: 'community', label: 'Community feed and messages', included: false, limit: null }],
        },
        {
          id: 'premium',
          name: 'Premium',
          priceMinor: 79900,
          interval: 'month',
          features: [{ key: 'community', label: 'Community feed and messages', included: false, limit: null }],
        },
      ],
    });
    await request(app).get('/api/v1/community/posts').set(premium.headers).expect(402);
  });
});

describe('Events', () => {
  it('records the premium price during early access and the full price once booking is open', async () => {
    const admin = await person({ name: 'Rajiv Bhatia', role: 'admin' });
    const premium = await person({ name: 'Aarav Sharma', plan: 'premium' });
    const free = await person({ name: 'Saanvi Nair' });
    const early = eventBody();
    const opened = eventBody({
      title: 'Indiranagar strength workshop',
      publicOpensAt: new Date(Date.now() - day).toISOString(),
      startsAt: new Date(Date.now() + 7 * day).toISOString(),
      endsAt: new Date(Date.now() + 7 * day + 2 * 60 * 60 * 1000).toISOString(),
      fullPriceMinor: 150000,
      premiumPriceMinor: 99900,
    });

    await request(app).post('/api/v1/events/admin').set(free.headers).send(early).expect(403);

    const created = await request(app).post('/api/v1/events/admin').set(admin.headers).send(early);
    expect(created.status).toBe(201);
    const open = await request(app).post('/api/v1/events/admin').set(admin.headers).send(opened);
    expect(open.status).toBe(201);

    const tooSoon = await request(app)
      .post(`/api/v1/events/${created.body.data._id}/rsvp`)
      .set(free.headers);
    expect(tooSoon.status).toBe(403);
    expect(await EventRsvp.countDocuments({ eventId: created.body.data._id })).toBe(0);

    const earlyBook = await request(app)
      .post(`/api/v1/events/${created.body.data._id}/rsvp`)
      .set(premium.headers);
    expect(earlyBook.status).toBe(200);
    expect(earlyBook.body.data.access).toBe('early');
    expect(earlyBook.body.data.rsvp).toMatchObject({
      priceMinor: 49900,
      planAtSignup: 'premium',
      status: 'going',
    });

    const freeOpen = await request(app)
      .post(`/api/v1/events/${open.body.data._id}/rsvp`)
      .set(free.headers);
    expect(freeOpen.body.data.access).toBe('open');
    expect(freeOpen.body.data.rsvp.priceMinor).toBe(150000);
    expect(freeOpen.body.data.yourPriceMinor).toBe(150000);

    const premiumOpen = await request(app)
      .post(`/api/v1/events/${open.body.data._id}/rsvp`)
      .set(premium.headers);
    expect(premiumOpen.body.data.rsvp.priceMinor).toBe(99900);
    expect(premiumOpen.body.data.yourPriceMinor).toBe(99900);

    const listed = await request(app).get('/api/v1/events').set(free.headers);
    const earlyCard = listed.body.data.find((event) => event.title === 'Cubbon Park sunrise run');
    expect(earlyCard.canRsvp).toBe(false);
    expect(earlyCard.fullPriceMinor).toBe(79900);
    expect(earlyCard.premiumPriceMinor).toBe(49900);

    const invalid = await request(app).post('/api/v1/events/admin').set(admin.headers).send({
      ...early,
      title: 'Broken price',
      premiumPriceMinor: 90000,
      fullPriceMinor: 100,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.join(' ')).toMatch(/premium price/i);
  });
});

import request from 'supertest';
import app from '../src/app.js';

describe('Auth', () => {
  const credentials = {
    name: 'Test Athlete',
    email: 'test-athlete@example.com',
    password: 'Password123!',
  };

  it('registers a new user and sets an accessToken cookie', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(credentials.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.roles).toEqual(['athlete']);
    expect(res.headers['set-cookie']?.[0]).toMatch(/accessToken=/);
  });

  it('rejects self-assigned staff roles', async () => {
    const res=await request(app).post('/api/v1/auth/register').send({...credentials,roles:['coach','gym_owner']});
    expect(res.status).toBe(400);
  });

  it('rejects registration with a weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...credentials, password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const res = await request(app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);

    const goodLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(goodLogin.status).toBe(200);

    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' });
    expect(badLogin.status).toBe(401);
  });

  it('rejects /me without a token and accepts it with one', async () => {
    const anon = await request(app).get('/api/v1/auth/me');
    expect(anon.status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials);
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(credentials.email);
  });
});

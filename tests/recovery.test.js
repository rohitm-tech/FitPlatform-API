import request from 'supertest';
import app from '../src/app.js';
import {User} from '../src/models/userModel.js';
import {Recovery} from '../src/models/recoveryModel.js';
import {TrainingReview} from '../src/models/trainingReviewModel.js';
import {recoveryReadiness,completionReview} from '../src/services/analytics/recoveryRules.js';
const auth=async(role='athlete')=>{const u=await User.create({name:'Recovery test',email:role+'@recovery.test',passwordHash:'Password123!',roles:[role]});return{u,headers:{Authorization:`Bearer ${u.generateAccessToken()}`}}};
it('keeps missing and stale recovery data distinct',()=>{
 expect(recoveryReadiness([]).score).toBeNull();
 expect(recoveryReadiness([{date:'2020-01-01',sleepMinutes:500}]).status).toBe('stale');
 expect(recoveryReadiness([{date:new Date().toISOString().slice(0,10),sleepMinutes:300,fatigue:9,soreness:8}]).status).toBe('recover');
});
it('compares assigned sets, repetitions and load without claiming proof',()=>{
 const result=completionReview({items:[{exerciseId:'squat',sets:3,reps:10,targetWeightKg:20}]},{items:[{exerciseId:'squat',sets:[{reps:10,weightKg:20},{reps:8,weightKg:20}]}],painFlag:false});
 expect(result.coverage).toBe(33);expect(result.status).toBe('partial');expect(result.explanation).toMatch(/do not prove/);
});
it('persists recovery and queues a durable review on save',async()=>{
 const {u,headers}=await auth();const res=await request(app).post('/api/v1/performance/daily').set(headers).send({date:new Date().toISOString().slice(0,10),sleepMinutes:430,fatigue:3});
 expect(res.status).toBe(201);expect(await Recovery.countDocuments({athleteId:u._id})).toBe(1);expect(await TrainingReview.countDocuments({athleteId:u._id,status:'queued'})).toBe(1);
});
it('requires consent for imports and does not accept forged live-watch provenance',async()=>{
 const {headers}=await auth();const records=[{date:'2026-10-31',sleepMinutes:400}];
 expect((await request(app).post('/api/v1/performance/import').set(headers).send({sourceLabel:'Watch',records})).status).toBe(400);
 const accepted=await request(app).post('/api/v1/performance/import').set(headers).send({consent:true,sourceLabel:'Watch export',records});expect(accepted.status).toBe(200);expect((await Recovery.findOne()).source).toBe('import');
});
it('rejects invalid metrics and prevents coach account ingestion',async()=>{
 const {headers}=await auth('coach');expect((await request(app).post('/api/v1/performance/daily').set(headers).send({date:'2026-10-31',sleepMinutes:430})).status).toBe(403);
});

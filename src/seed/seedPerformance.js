import mongoose from 'mongoose';
import {connectDatabase} from '../database/connectDatabase.js';
import {User} from '../models/userModel.js';
import {Recovery} from '../models/recoveryModel.js';
import {Workout} from '../models/workoutModel.js';
import {Exercise} from '../models/exerciseModel.js';
import {CoachAthlete} from '../models/coachAthleteModel.js';
import {queueReview} from '../services/ai/reviewService.js';
await connectDatabase();
const athletes=await User.find({email:/^athlete\d+@fitplatform\.app$/});
const exercises=await Exercise.find({difficulty:'beginner'}).limit(6);
for(let index=0;index<athletes.length;index++){
 const athlete=athletes[index];
 for(let day=0;day<28;day++){const date=new Date(Date.now()-day*864e5).toISOString().slice(0,10);const poor=index%3===1&&day<2;
 await Recovery.updateOne({athleteId:athlete._id,date,source:'demo'},{$setOnInsert:{sourceLabel:'Seeded demo wearable data',sleepMinutes:poor?310:420+(day*17+index*11)%100,restingHeartRate:poor?72:55+index+(day%4),hrvMs:poor?28:42+(day*3+index)%25,steps:3500+(index*1000+day*777)%8500,fatigue:poor?8:3+(day+index)%3,soreness:poor?7:2+(day+index)%4}},{upsert:true});}
 const link=await CoachAthlete.findOne({athleteId:athlete._id,status:'active'});
 for(let day=1;day<=5;day+=2){const date=new Date();date.setHours(18,0,0,0);date.setDate(date.getDate()+day-1);const title=day===1?'Push + pull foundations':day===3?'Lower-body strength':'Full-body balance';
 await Workout.updateOne({athleteId:athlete._id,title,date},{$setOnInsert:{assignedBy:String(link?.coachId||athlete._id),status:'planned',items:exercises.slice(0,4).map(e=>({exerciseId:e._id,sets:3,reps:10,targetWeightKg:15,restSec:90,notes:'Keep a comfortable effort.'}))}},{upsert:true});}
 await queueReview({athleteId:athlete._id,trigger:'recovery_updated',eventKey:`demo-recovery:${athlete._id}:${new Date().toISOString().slice(0,10)}`});
}
console.log(`Stored 28 days of explicitly labeled demo recovery data for ${athletes.length} seeded athletes. Existing personal data was preserved.`);
await mongoose.disconnect();

import {User} from '../src/models/userModel.js';
import {Muscle} from '../src/models/muscleModel.js';
import {Exercise} from '../src/models/exerciseModel.js';
import {WorkoutLog} from '../src/models/workoutLogModel.js';
import {getMuscleGroupVolume} from '../src/services/analytics/trainingAnalytics.js';
import {getCurrentStreak} from '../src/services/analytics/performanceAnalytics.js';
it('counts exercise sets once per group even when two primary muscles share that group',async()=>{
 const user=await User.create({name:'Test',email:'test@analytics.com',passwordHash:'Password123!'});
 const muscles=await Muscle.create([{key:'upper-chest',displayName:'Upper chest',group:'chest'},{key:'lower-chest',displayName:'Lower chest',group:'chest'}]);
 const exercise=await Exercise.create({name:'Press',slug:'press',primaryMuscles:muscles.map(m=>m._id),equipment:['bodyweight']});
 await WorkoutLog.create({athleteId:user._id,date:new Date(),items:[{exerciseId:exercise._id,sets:[{reps:10,weightKg:20},{reps:10,weightKg:20}]}]});
 expect((await getMuscleGroupVolume(user._id,7)).chest).toBe(2);
});
it('does not present an ended historical streak as current',async()=>{
 const user=await User.create({name:'Test',email:'test@analytics.com',passwordHash:'Password123!'});
 await WorkoutLog.create({athleteId:user._id,date:new Date(Date.now()-5*864e5),items:[]});
 const result=await getCurrentStreak(user._id);expect(result.currentStreak).toBe(0);expect(result.daysSinceLastWorkout).toBe(5);
});

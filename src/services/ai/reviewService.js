import {z} from 'zod';
import {TrainingReview} from '../../models/trainingReviewModel.js';
import {Recovery} from '../../models/recoveryModel.js';
import {Workout} from '../../models/workoutModel.js';
import {WorkoutLog} from '../../models/workoutLogModel.js';
import {recoveryReadiness,completionReview} from '../analytics/recoveryRules.js';
import {ask} from './aiService.js';
export const ReviewOutput=z.object({summary:z.string().min(1).max(2000),observations:z.array(z.string().max(500)).max(6),recommendation:z.enum(['keep','reduce','rest']),reason:z.string().min(1).max(1000)});
export async function queueReview({athleteId,workoutId,logId,trigger,eventKey}){return TrainingReview.findOneAndUpdate({eventKey},{$setOnInsert:{athleteId,workoutId,logId,trigger,status:'queued'}},{upsert:true,new:true});}
export async function processReview(job){
 const records=await Recovery.find({athleteId:job.athleteId}).sort({date:-1,updatedAt:-1}).limit(30).lean();
 const log=job.logId?await WorkoutLog.findOne({_id:job.logId,athleteId:job.athleteId}).lean():null;
 let workout=job.workoutId?await Workout.findOne({_id:job.workoutId,athleteId:job.athleteId}).lean():await Workout.findOne({athleteId:job.athleteId,status:'planned',date:{$gte:new Date(new Date().setHours(0,0,0,0))}}).sort({date:1}).lean();
 if(workout?.status!=='planned')workout=await Workout.findOne({athleteId:job.athleteId,status:'planned',date:{$gte:new Date(new Date().setHours(0,0,0,0))}}).sort({date:1}).lean();
 const assignedWorkout=log?.workoutId?await Workout.findById(log.workoutId).lean():workout;
 const readiness=recoveryReadiness(records),completion=completionReview(assignedWorkout,log);
 const mustRest=completion.pain,limit=readiness.score!=null&&readiness.score<50;
 let analysis,aiStatus='ready';
 try{analysis=ReviewOutput.parse(JSON.parse(await ask(`You are a coaching copilot. Return JSON {summary:string,observations:string[],recommendation:keep|reduce|rest,reason:string}. Do not diagnose. Never claim wearable data or self-reported logs prove physical completion. Use only supplied evidence. Pain means rest and professional assessment. Low readiness means reduce or rest. Data: ${JSON.stringify({readiness,completion,workout:workout?{title:workout.title,items:workout.items.map(i=>({sets:i.sets,reps:i.reps}))}:null})}`)));}
 catch{aiStatus='unavailable';analysis={summary:'Automatic rules review completed. AI explanation is unavailable.',observations:[...readiness.reasons,...(completion.coverage!=null?[`Assignment targets met: ${completion.coverage}%.`]:[])],recommendation:mustRest?'rest':limit?'reduce':'keep',reason:mustRest?'Pain was recorded. Stop painful exercise and consult a qualified professional.':limit?'Recovery signals suggest lowering training demand.':'Keep the coach plan; no automatic changes were made.'};}
 // Deterministic safety overrides model wording and proposals.
 if(mustRest){analysis.recommendation='rest';analysis.reason='Pain was reported. Do not train through pain; seek a qualified professional.';}else if(limit&&analysis.recommendation==='keep'){analysis.recommendation='reduce';analysis.reason='Low training-readiness score requires a conservative coach review.';}
 await TrainingReview.updateOne({_id:job._id},{$set:{status:'ready',rules:{readiness,completion},analysis,aiStatus,workoutId:workout?._id,baseWorkoutUpdatedAt:workout?.updatedAt,approval:workout&&analysis.recommendation!=='keep'?'pending':'not_required',error:null}});
}
let timer,busy=false;
export async function runReviewQueue(){if(busy)return;busy=true;try{for(let n=0;n<5;n++){
 const now=new Date();const job=await TrainingReview.findOneAndUpdate({$or:[{status:'queued',nextAttemptAt:{$exists:false}},{status:'queued',nextAttemptAt:{$lte:now}},{status:'processing',leaseUntil:{$lt:now}}]},{$set:{status:'processing',leaseUntil:new Date(Date.now()+120000)},$inc:{attempts:1}},{new:true,sort:{createdAt:1}});if(!job)break;
 try{await processReview(job)}catch{await TrainingReview.updateOne({_id:job._id},{$set:{status:job.attempts>=3?'failed':'queued',nextAttemptAt:new Date(Date.now()+30000),error:'Review could not be completed. Please retry.'}});}
 }}finally{busy=false;}}
export function startReviewWorker(){timer=setInterval(()=>runReviewQueue().catch(()=>{}),10000);timer.unref();runReviewQueue().catch(()=>{});return()=>clearInterval(timer);}

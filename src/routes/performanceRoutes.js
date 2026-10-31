import rateLimit from 'express-rate-limit';
import {Router} from 'express';
import {z} from 'zod';
import {Recovery} from '../models/recoveryModel.js';
import {TrainingReview} from '../models/trainingReviewModel.js';
import {CoachAthlete} from '../models/coachAthleteModel.js';
import {Workout} from '../models/workoutModel.js';
import {User} from '../models/userModel.js';
import {verifyJWT} from '../middlewares/authMiddleware.js';
import {requireRole} from '../middlewares/roleMiddleware.js';
import {validateBody} from '../validations/schemas.js';
import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/apiError.js';
import {ApiResponse} from '../utils/apiResponse.js';
import {queueReview} from '../services/ai/reviewService.js';
import {recoveryReadiness} from '../services/analytics/recoveryRules.js';
import {config} from '../config/env.js';
const r=Router();r.use(verifyJWT);const ingestLimiter=rateLimit({windowMs:3600000,max:30,keyGenerator:req=>String(req.user._id),standardHeaders:true,legacyHeaders:false});r.use((req,res,next)=>req.method==='POST'?ingestLimiter(req,res,next):next());
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
export const dailySchema=z.object({date,sleepMinutes:z.number().int().min(0).max(1440).optional(),restingHeartRate:z.number().min(25).max(220).optional(),hrvMs:z.number().min(1).max(400).optional(),steps:z.number().int().min(0).max(200000).optional(),fatigue:z.number().int().min(1).max(10).optional(),soreness:z.number().int().min(1).max(10).optional(),notes:z.string().max(1000).optional()}).refine(v=>Object.keys(v).some(k=>!['date','notes'].includes(k)),'At least one measurement is required');
async function store(athleteId,data,source,sourceLabel){const record=await Recovery.findOneAndUpdate({athleteId,date:data.date,source},{$set:{...data,sourceLabel}},{upsert:true,new:true,runValidators:true});await queueReview({athleteId,trigger:'recovery_updated',eventKey:`recovery:${record._id}:${record.updatedAt.toISOString()}`});return record;}
r.get('/me',requireRole('athlete'),asyncHandler(async(req,res)=>{const [records,reviews]=await Promise.all([Recovery.find({athleteId:req.user._id}).sort({date:-1,updatedAt:-1}).limit(30).lean(),TrainingReview.find({athleteId:req.user._id}).sort({createdAt:-1}).limit(10).lean()]);res.json(new ApiResponse(200,{records,readiness:recoveryReadiness(records),reviews,ai:{configured:!!config.GEMINI_API_KEY,model:config.GEMINI_MODEL},providers:[{id:'fitbit',name:'Fitbit',status:'import_available',detail:'Import an exported sleep/activity JSON. Live sync requires a registered provider app and authorization.'},{id:'health_connect',name:'Health Connect / Apple Health',status:'import_available',detail:'The normalized import endpoint accepts exported daily metrics. Direct phone sync needs a native mobile bridge.'}]},'Performance data'));}));
r.post('/daily',requireRole('athlete'),validateBody(dailySchema),asyncHandler(async(req,res)=>res.status(201).json(new ApiResponse(201,await store(req.user._id,req.body,'manual','Daily check-in'),'Recovery saved; review queued'))));
r.post('/import',requireRole('athlete'),validateBody(z.object({consent:z.literal(true),sourceLabel:z.string().trim().min(1).max(80),records:z.array(dailySchema).min(1).max(90)})),asyncHandler(async(req,res)=>{const records=[];for(const data of req.body.records)records.push(await store(req.user._id,data,'import',req.body.sourceLabel));res.json(new ApiResponse(201,{count:records.length},'Wearable export imported; automatic reviews queued'));}));
r.post('/import/fitbit',requireRole('athlete'),validateBody(z.object({consent:z.literal(true),date,sleep:z.object({summary:z.object({totalMinutesAsleep:z.number().int().min(0).max(1440)})}),restingHeartRate:z.number().min(25).max(220).optional(),steps:z.number().int().min(0).max(200000).optional()})),asyncHandler(async(req,res)=>{const {date,sleep,restingHeartRate,steps}=req.body;const row=await store(req.user._id,{date,sleepMinutes:sleep.summary.totalMinutesAsleep,restingHeartRate,steps},'import','Fitbit export (user supplied)');res.json(new ApiResponse(201,row,'Fitbit sleep export imported'));}));
r.get('/coach',requireRole('coach'),asyncHandler(async(req,res)=>{
 const links=await CoachAthlete.find({coachId:req.user._id,status:'active'}).populate('athleteId','name email profile');
 const athletes=await Promise.all(links.filter(l=>l.athleteId).map(async l=>{const id=l.athleteId._id;const [records,review]=await Promise.all([Recovery.find({athleteId:id}).sort({date:-1,updatedAt:-1}).limit(30).lean(),TrainingReview.findOne({athleteId:id}).sort({createdAt:-1}).lean()]);const readiness=recoveryReadiness(records);const summary={score:readiness.score,status:readiness.status,fresh:readiness.fresh,reasons:readiness.reasons};return{athlete:{_id:id,name:l.athleteId.name,email:l.athleteId.email},readiness:summary,latest: l.athleteId.profile?.shareDetailedLogs?readiness.latest:null,review:review?{...review,...(!l.athleteId.profile?.shareDetailedLogs?{analysis:review.analysis?{...review.analysis,summary:`Recovery is ${readiness.status}. ${review.rules?.completion?.coverage!=null?review.rules.completion.coverage+'% of assignment targets met.':''}`,observations:readiness.reasons,reason:'Review the proposed adjustment using the available summary signals.'}:null}:{}),rules:{completion:review.rules?.completion,readiness:summary}}:null};}));
 res.json(new ApiResponse(200,{athletes},'Coach performance queue'));
}));
r.post('/reviews/:id/decision',requireRole('coach'),validateBody(z.object({decision:z.enum(['approve','decline'])})),asyncHandler(async(req,res)=>{
 const review=await TrainingReview.findById(req.params.id);if(!review)throw new ApiError(404,'Review not found');
 if(!await CoachAthlete.exists({coachId:req.user._id,athleteId:review.athleteId,status:'active'}))throw new ApiError(403,'Not your athlete');
 if(review.status!=='ready'||review.approval!=='pending')throw new ApiError(409,'Review is not awaiting approval');
 const claimed=await TrainingReview.findOneAndUpdate({_id:review._id,approval:'pending',$or:[{decisionLeaseUntil:{$exists:false}},{decisionLeaseUntil:{$lt:new Date()}}]},{$set:{decisionLeaseUntil:new Date(Date.now()+30000)}},{new:true});if(!claimed)throw new ApiError(409,'Another decision is in progress');
 try{
 if(req.body.decision==='approve'){
 const workout=await Workout.findOne({_id:review.workoutId,athleteId:review.athleteId,status:'planned',assignedBy:String(req.user._id),updatedAt:review.baseWorkoutUpdatedAt});
 if(!workout)throw new ApiError(409,'The plan changed or was assigned by another coach. Request a fresh review.');
 const items=workout.items.map(i=>({...i.toObject(),sets:Math.max(1,Math.floor(i.sets*.7)),notes:`${i.notes||''} Coach-approved recovery adjustment.`}));
 const result=await Workout.updateOne({_id:workout._id,status:'planned',updatedAt:review.baseWorkoutUpdatedAt},review.analysis.recommendation==='rest'?{$set:{status:'skipped'}}:{$set:{items}},{timestamps:true});
 if(!result.modifiedCount)throw new ApiError(409,'Workout changed; reload before approving');
 }
 const result=await TrainingReview.updateOne({_id:review._id,approval:'pending'},{$set:{approval:req.body.decision==='approve'?'approved':'declined',reviewedBy:req.user._id,reviewedAt:new Date()}});if(!result.modifiedCount)throw new ApiError(409,'Already reviewed');
 await TrainingReview.updateOne({_id:review._id},{$unset:{decisionLeaseUntil:1}});
 res.json(new ApiResponse(200,null,'Coach decision saved'));
 }catch(error){await TrainingReview.updateOne({_id:review._id},{$unset:{decisionLeaseUntil:1}});throw error;}
}));
r.post('/reviews/:id/retry',requireRole('coach'),asyncHandler(async(req,res)=>{const review=await TrainingReview.findById(req.params.id);if(!review||!await CoachAthlete.exists({coachId:req.user._id,athleteId:review.athleteId,status:'active'}))throw new ApiError(403,'Review access denied');if(!['failed','ready'].includes(review.status))throw new ApiError(409,'Review already running');await queueReview({athleteId:review.athleteId,trigger:'coach_requested',eventKey:`retry:${review._id}:${Date.now()}`});res.json(new ApiResponse(202,null,'Fresh review queued'));}));
export default r;

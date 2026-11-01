import { notifyAssignment } from '../services/notificationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { WorkoutTemplate } from '../models/workoutTemplateModel.js';
import { Workout } from '../models/workoutModel.js';
import { CoachAthlete } from '../models/coachAthleteModel.js';

export const listTemplates = asyncHandler(async (req, res) => {
  const templates = await WorkoutTemplate.find({ coachId: req.user._id })
    .populate('items.exerciseId', 'name slug')
    .sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse(200, templates, 'Templates fetched'));
});

export const createTemplate = asyncHandler(async (req, res) => {
  const template = await WorkoutTemplate.create({ ...req.body, coachId: req.user._id });
  return res.status(201).json(new ApiResponse(201, template, 'Template created'));
});

// Assigns a template to one or several athletes on one or several dates.
// Only athletes this coach actively coaches may be targeted — enforced here
// rather than relying on the UI to only show valid athletes.
export const assignTemplate = asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const { athleteIds, dates } = req.body;

  const template = await WorkoutTemplate.findOne({ _id: templateId, coachId: req.user._id });
  if (!template) throw new ApiError(404, 'Template not found');

  const activeLinks = await CoachAthlete.find({
    coachId: req.user._id,
    athleteId: { $in: athleteIds },
    status: 'active',
  });
  const permittedAthleteIds = new Set(activeLinks.map((link) => String(link.athleteId)));
  const invalidIds = athleteIds.filter((id) => !permittedAthleteIds.has(id));
  if (invalidIds.length > 0) {
    throw new ApiError(403, 'Forbidden - one or more athletes are not coached by you');
  }

  const templateSport = template.sport || 'Strength';
  const wrongSport = activeLinks.filter((link) => (link.sport || 'Strength') !== templateSport);
  if (wrongSport.length > 0) {
    const theirs = [...new Set(wrongSport.map((link) => link.sport || 'Strength'))];
    throw new ApiError(
      400,
      `This session is ${templateSport}. Those athletes train ${theirs.join(', ')} with you.`,
    );
  }

  const workouts = [];
  for (const athleteId of athleteIds) {
    for (const date of dates) {
      workouts.push({
        athleteId,
        assignedBy: req.user._id.toString(),
        date: new Date(date),
        title: template.title,
        sport: templateSport,
        items: template.items,
        status: 'planned',
      });
    }
  }

  const created = await Workout.insertMany(workouts);
  await Promise.all(created.map(workout=>notifyAssignment(workout,req.user.name)));
  return res.status(201).json(new ApiResponse(201, created, 'Workout assigned'));
});

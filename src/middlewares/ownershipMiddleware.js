import { ApiError } from '../utils/apiError.js';
import { CoachAthlete } from '../models/coachAthleteModel.js';
import { Gym } from '../models/gymModel.js';

// A coach may only read/write athletes they actively coach. Hiding the UI is
// not security — this is enforced on every athlete-scoped coach route.
// Expects :athleteId in req.params.
export const requireCoachOwnsAthlete = async (req, res, next) => {
  try {
    const athleteId = req.params.athleteId;
    if (!req.user.roles?.includes('coach')) throw new ApiError(403, 'Coach access is required');
    const link = await CoachAthlete.findOne({
      coachId: req.user._id,
      athleteId,
      status: 'active',
    });
    if (!link) {
      throw new ApiError(403, 'Forbidden - not this athlete\'s coach');
    }
    next();
  } catch (error) {
    next(error);
  }
};

// A gym owner may only manage their own gym. Expects :gymId in req.params.
export const requireOwnsGym = async (req, res, next) => {
  try {
    const gym = await Gym.findById(req.params.gymId);
    if (!gym) {
      throw new ApiError(404, 'Gym not found');
    }
    if (String(gym.ownerId) !== String(req.user._id)) {
      throw new ApiError(403, 'Forbidden - not this gym\'s owner');
    }
    req.gym = gym;
    next();
  } catch (error) {
    next(error);
  }
};

// An athlete may only act on their own data unless the caller is their
// active coach. Expects :athleteId in req.params.
export const requireSelfOrCoach = async (req, res, next) => {
  try {
    const athleteId = req.params.athleteId;
    if (String(req.user._id) === String(athleteId)) {
      return next();
    }
    if (!req.user.roles?.includes('coach')) throw new ApiError(403, 'Coach access is required');
    const link = await CoachAthlete.findOne({
      coachId: req.user._id,
      athleteId,
      status: 'active',
    });
    if (!link) {
      throw new ApiError(403, 'Forbidden - not this athlete or their coach');
    }
    next();
  } catch (error) {
    next(error);
  }
};

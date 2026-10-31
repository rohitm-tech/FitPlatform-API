import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { User } from '../models/userModel.js';

export const completeOnboarding = asyncHandler(async (req, res) => {
  const profileUpdates = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(profileUpdates).map(([key, value]) => [`profile.${key}`, value])
        ),
        onboardingCompleted: true,
      },
    },
    { new: true, runValidators: true }
  ).select('-passwordHash');

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Onboarding completed'));
});

export const exportMyData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-passwordHash').lean();
  return res
    .status(200)
    .json(new ApiResponse(200, { user }, 'Data export generated'));
});

export const deleteMyAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.user._id);
  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Account deleted'));
});

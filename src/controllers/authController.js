import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { accessTokenCookieOptions } from '../utils/cookieOptions.js';
import { User } from '../models/userModel.js';

export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, roles } = req.body;

  const existedUser = await User.findOne({ email: email.toLowerCase() });
  if (existedUser) {
    throw new ApiError(409, 'User with email already exists');
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: password,
    roles: roles && roles.length ? roles : ['athlete'],
  });

  const createdUser = await User.findById(user._id).select('-passwordHash');
  const accessToken = createdUser.generateAccessToken();

  return res
    .status(201)
    .cookie('accessToken', accessToken, accessTokenCookieOptions())
    .json(new ApiResponse(201, { user: createdUser }, 'User registered successfully'));
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new ApiError(404, 'User does not exist');
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid user credentials');
  }

  const accessToken = user.generateAccessToken();
  const loggedInUser = await User.findById(user._id).select('-passwordHash');

  return res
    .status(200)
    .cookie('accessToken', accessToken, accessTokenCookieOptions())
    .json(new ApiResponse(200, { user: loggedInUser }, 'User logged in successfully'));
});

export const logoutUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .clearCookie('accessToken', accessTokenCookieOptions())
    .json(new ApiResponse(200, {}, 'User logged out'));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, 'Current user fetched successfully'));
});

// Stub: in production this would email a reset link. For the prototype it
// just acknowledges the request without leaking whether the email exists.
export const forgotPassword = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'If that email exists, a reset link has been sent'));
});

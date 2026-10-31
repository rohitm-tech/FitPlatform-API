import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const ROLES = ['athlete', 'coach', 'gym_owner', 'admin'];

const profileSchema = new mongoose.Schema(
  {
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
    dateOfBirth: { type: Date },
    heightCm: { type: Number },
    weightKg: { type: Number },
    experienceLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    goal: {
      type: String,
      enum: ['muscle_gain', 'fat_loss', 'strength', 'general_fitness', 'race'],
      default: 'general_fitness',
    },
    trainingDaysPerWeek: { type: Number, min: 1, max: 7, default: 3 },
    equipmentAccess: {
      type: [String],
      default: [],
    },
    injuries: { type: String, default: '' },
    bodyModelPreference: { type: String, enum: ['male', 'female'], default: 'male' },
    shareDetailedLogs: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    roles: {
      type: [String],
      enum: ROLES,
      default: ['athlete'],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'A user must have at least one role',
      },
    },
    gymId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gym',
      default: null,
    },
    profile: {
      type: profileSchema,
      default: () => ({}),
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ gymId: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      name: this.name,
      roles: this.roles,
    },
    config.JWT_SECRET || 'default_secret',
    { expiresIn: config.JWT_EXPIRES_IN }
  );
};

export const USER_ROLES = ROLES;
export const User = mongoose.model('User', userSchema);

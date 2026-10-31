import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    coachId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    headline: { type: String, maxlength: 120, default: "" },
    bio: { type: String, maxlength: 3000, default: "" },
    specialties: [String],
    location: { type: String, maxlength: 100, default: "" },
    languages: [String],
    experienceYears: { type: Number, min: 0, max: 60 },
    remoteAvailable: { type: Boolean, default: true },
    acceptingAthletes: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: false },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const CoachProfile = mongoose.model("CoachProfile", schema);

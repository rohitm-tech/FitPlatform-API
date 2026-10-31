import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
    },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"] },
        text: String,
        photoId:{type:mongoose.Schema.Types.ObjectId,ref:"CoachPhoto"},
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
export const AiConversation = mongoose.model("AiConversation", schema);

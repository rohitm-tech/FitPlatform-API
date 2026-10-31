import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventKey: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "assignment",
        "invitation",
        "review",
        "plan_change",
        "marketplace",
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, maxlength: 500 },
    href: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ recipientId: 1, eventKey: 1 }, { unique: true });
schema.index({ recipientId: 1, readAt: 1, _id: -1 });
export const Notification = mongoose.model("Notification", schema);

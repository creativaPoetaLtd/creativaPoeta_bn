import mongoose, { Schema, Document } from "mongoose";

export interface IQuery extends Document {
  name: string;
  email: string;
  message: string;
  status: "pending" | "replied" | "closed";
  isReplied: boolean;
  replyMessage?: string;
  repliedAt?: Date;
  repliedBy?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedAt?: Date;
  activity?: Array<{
    type: "assigned" | "released" | "opened" | "replied" | "status";
    message: string;
    actorEmail?: string;
    actorName?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const QuerySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "replied", "closed"],
      default: "pending",
    },
    isReplied: { type: Boolean, default: false },
    replyMessage: { type: String },
    repliedAt: { type: Date },
    repliedBy: { type: String },
    assignedToEmail: { type: String, trim: true, lowercase: true },
    assignedToName: { type: String, trim: true },
    assignedAt: { type: Date },
    activity: [
      {
        type: {
          type: String,
          enum: ["assigned", "released", "opened", "replied", "status"],
          required: true,
        },
        message: { type: String, required: true },
        actorEmail: { type: String, trim: true, lowercase: true },
        actorName: { type: String, trim: true },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

QuerySchema.index({ assignedToEmail: 1, createdAt: -1 });

export default mongoose.model<IQuery>("Query", QuerySchema);

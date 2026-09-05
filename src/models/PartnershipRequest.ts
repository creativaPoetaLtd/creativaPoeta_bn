import mongoose, { Document, Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export type PartnershipRequestStatus = "pending" | "in_progress" | "replied" | "closed";

export interface IPartnershipRequest extends Document {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  partnershipType: string;
  locale: string;
  message: string;
  status: PartnershipRequestStatus;
  replyMessage?: string;
  repliedAt?: Date;
  repliedBy?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedAt?: Date;
  activity: Array<{
    type: "assigned" | "released" | "opened" | "replied" | "status";
    message: string;
    actorEmail?: string;
    actorName?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const PartnershipRequestSchema = new Schema<IPartnershipRequest>(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    partnershipType: { type: String, required: true, trim: true },
    locale: { type: String, trim: true, default: "en" },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "replied", "closed"],
      default: "pending",
    },
    replyMessage: { type: String },
    repliedAt: { type: Date },
    repliedBy: { type: String, trim: true, lowercase: true },
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

PartnershipRequestSchema.plugin(softDeletePlugin, { entityType: "partnership_request" });

PartnershipRequestSchema.index({ status: 1, createdAt: -1 });
PartnershipRequestSchema.index({ assignedToEmail: 1, createdAt: -1 });

export default mongoose.model<IPartnershipRequest>(
  "PartnershipRequest",
  PartnershipRequestSchema
);

import mongoose, { Schema, Document } from "mongoose";

export interface IProjectRequest extends Document {
  // Personal Information
  name: string;
  email: string;
  phone: string;
  company?: string;
  additionalInfo?: string;
  locale: string;

  // Service Information (New Structure)
  serviceType: string;
  selectedServices: string[];
  customServiceDescription?: string; // For "Other" service type description
  customServiceNeeds?: string; // For "Other" specific needs description
  serviceSpecificOtherDescription?: string; // For when user selects "Other" from service options

  // Status and Management
  status: string;
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

const ProjectRequestSchema: Schema = new Schema(
  {
    // Personal Information
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    additionalInfo: { type: String, trim: true },
    locale: { type: String, trim: true, default: "en", maxlength: 12 },

    // Service Information (New Structure)
    serviceType: { type: String, required: true, trim: true },
    selectedServices: [{ type: String, trim: true }],
    customServiceDescription: { type: String, trim: true }, // For "Other" service type description
    customServiceNeeds: { type: String, trim: true }, // For "Other" specific needs description
    serviceSpecificOtherDescription: { type: String, trim: true }, // For when user selects "Other" from service options

    // Status and Management
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "in-review", "replied", "completed"],
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

ProjectRequestSchema.index({ assignedToEmail: 1, createdAt: -1 });

export default mongoose.model<IProjectRequest>(
  "ProjectRequest",
  ProjectRequestSchema
);

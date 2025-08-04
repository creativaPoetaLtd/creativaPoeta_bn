import mongoose, { Schema, Document } from "mongoose";

export interface IProjectRequest extends Document {
  // Personal Information
  name: string;
  email: string;
  phone: string;
  company?: string;
  additionalInfo?: string;

  // Project Details
  projectType: string;
  deliverables: string[];
  mainGoal: string;
  audience: string[];
  stylePreference: string;
  contentElements: string[];
  budget: number;
  timeline: string;
  projectPurpose: string[];

  // Status and Management
  status: string;
  isReplied: boolean;
  replyMessage?: string;
  repliedAt?: Date;
  repliedBy?: string;

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

    // Project Details
    projectType: { type: String, required: true, trim: true },
    deliverables: [{ type: String, required: true, trim: true }],
    mainGoal: { type: String, required: true, trim: true },
    audience: [{ type: String, required: true, trim: true }],
    stylePreference: { type: String, required: true, trim: true },
    contentElements: [{ type: String, required: true, trim: true }],
    budget: { type: Number, required: true },
    timeline: { type: String, required: true, trim: true },
    projectPurpose: [{ type: String, required: true, trim: true }],

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
  },
  { timestamps: true }
);

export default mongoose.model<IProjectRequest>(
  "ProjectRequest",
  ProjectRequestSchema
);

import mongoose, { Document, Schema } from "mongoose";

export type JobApplicationKind = "job" | "spontaneous";
export type JobApplicationStatus = "new" | "reviewing" | "shortlisted" | "rejected" | "archived";

export interface IJobApplication extends Document {
  kind: JobApplicationKind;
  job?: mongoose.Types.ObjectId;
  jobTitle?: string;
  fullName: string;
  email?: string;
  phone?: string;
  country?: string;
  desiredRole?: string;
  experience?: string;
  skills?: string;
  linkedin?: string;
  portfolio?: string;
  hasCv?: boolean;
  cvOriginalName?: string;
  cvMimeType?: string;
  discoverySource?: string;
  discoverySourceOther?: string;
  availability?: string;
  message?: string;
  locale?: string;
  status: JobApplicationStatus;
  consentAcceptedAt: Date;
  reviewedByEmail?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JobApplicationSchema = new Schema<IJobApplication>(
  {
    kind: { type: String, enum: ["job", "spontaneous"], default: "spontaneous", index: true },
    job: { type: Schema.Types.ObjectId, ref: "Job", index: true },
    jobTitle: { type: String, trim: true, maxlength: 180 },
    fullName: { type: String, required: true, trim: true, maxlength: 180 },
    email: { type: String, trim: true, lowercase: true, maxlength: 240 },
    phone: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 120 },
    desiredRole: { type: String, trim: true, maxlength: 180 },
    experience: { type: String, trim: true, maxlength: 180 },
    skills: { type: String, trim: true, maxlength: 2000 },
    linkedin: { type: String, trim: true, maxlength: 500 },
    portfolio: { type: String, trim: true, maxlength: 500 },
    hasCv: { type: Boolean, default: false },
    cvOriginalName: { type: String, trim: true, maxlength: 240 },
    cvMimeType: { type: String, trim: true, maxlength: 160 },
    discoverySource: { type: String, trim: true, maxlength: 80, index: true },
    discoverySourceOther: { type: String, trim: true, maxlength: 300 },
    availability: { type: String, trim: true, maxlength: 180 },
    message: { type: String, trim: true, maxlength: 5000 },
    locale: { type: String, trim: true, maxlength: 12 },
    status: { type: String, enum: ["new", "reviewing", "shortlisted", "rejected", "archived"], default: "new", index: true },
    consentAcceptedAt: { type: Date, required: true },
    reviewedByEmail: { type: String, trim: true, lowercase: true },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

JobApplicationSchema.index({ status: 1, createdAt: -1 });
JobApplicationSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model<IJobApplication>("JobApplication", JobApplicationSchema);

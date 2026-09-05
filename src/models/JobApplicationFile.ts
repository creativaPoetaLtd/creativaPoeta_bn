import mongoose, { Document, Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";

export interface IJobApplicationFile extends Document {
  application: mongoose.Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  data: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

const JobApplicationFileSchema = new Schema<IJobApplicationFile>(
  {
    application: { type: Schema.Types.ObjectId, ref: "JobApplication", required: true, index: true },
    originalName: { type: String, required: true, trim: true, maxlength: 240 },
    mimeType: { type: String, required: true, trim: true, maxlength: 160 },
    size: { type: Number, required: true, min: 1, max: 4 * 1024 * 1024 },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

JobApplicationFileSchema.plugin(softDeletePlugin, { entityType: "job_application_file", audit: false });
JobApplicationFileSchema.index(
  { application: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "active_job_application_file_unique" }
);

export default mongoose.model<IJobApplicationFile>("JobApplicationFile", JobApplicationFileSchema);

import mongoose, { Schema, Document } from "mongoose";

export type JobType = 'fulltime' | 'parttime' | 'internship' | 'contract';
export type JobStatus = 'draft' | 'published' | 'closed';

export interface IJob {
  title: string;
  summary?: string;
  company: string;
  department?: string;
  location: string;
  type: JobType;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  isRemote: boolean;
  howToApply: string;
  status: JobStatus;
  applicationDeadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJobDocument extends IJob, Document {}

const JobSchema = new Schema({
  title: { 
    type: String, 
    required: [true, 'Job title is required'],
    trim: true
  },
  summary: { type: String, trim: true, maxlength: 500 },
  company: { 
    type: String, 
    required: [true, 'Company name is required'],
    trim: true
  },
  department: { type: String, trim: true, maxlength: 120 },
  location: { 
    type: String, 
    required: [true, 'Location is required'],
    trim: true
  },
  type: { 
    type: String, 
    enum: ['fulltime', 'parttime', 'internship', 'contract'],
    required: [true, 'Job type is required']
  },
  description: { 
    type: String, 
    required: [true, 'Job description is required']
  },
  responsibilities: [{
    type: String,
    required: [true, 'At least one responsibility is required']
  }],
  requirements: [{
    type: String,
    required: [true, 'At least one requirement is required']
  }],
  benefits: [{
    type: String
  }],
  isRemote: { 
    type: Boolean, 
    default: false 
  },
  howToApply: { 
    type: String, 
    default: 'Apply through the Creativa Poeta Career page.'
  },
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published', index: true },
  applicationDeadline: { type: Date }
}, {
  timestamps: true
});

JobSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IJobDocument>("Job", JobSchema);

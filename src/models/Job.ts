import mongoose, { Schema, Document } from "mongoose";

export type JobType = 'fulltime' | 'parttime' | 'internship' | 'contract';

export interface IJob {
  title: string;
  company: string;
  location: string;
  type: JobType;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  isRemote: boolean;
  howToApply: string;
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
  company: { 
    type: String, 
    required: [true, 'Company name is required'],
    trim: true
  },
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
    required: [true, 'Application instructions are required']
  }
}, {
  timestamps: true
});

export default mongoose.model<IJobDocument>("Job", JobSchema);
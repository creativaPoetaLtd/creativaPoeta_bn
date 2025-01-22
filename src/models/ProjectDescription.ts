import mongoose, { Schema, Document } from "mongoose";

export interface IProjectRequest extends Document {
  projectType: string;
  deliverables: string[];
  goals: string;
  clientType: string[];
  preferedStyle: string;
  content: string;
  budget: number;
  timeline: string;
  status: string;
  projectPurpose: string[];
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    company: string;
    addtionalInfo: string;
  };
  createdAt: Date;
}

const ProjectRequestSchema: Schema = new Schema(
  {
    projectType: { type: String, required: true },
    deliverables: [{ type: String, required: true }],
    goals: { type: String, required: true },
    clientType: [{ type: String, required: true }],
    preferedStyle: { type: String, required: true },
    content: { type: String, required: true },
    budget: { type: Number, required: true },
    timeline: { type: String, required: true },
    status: { type: String, default: "pending" },
    projectPurpose: [{ type: String, required: true }],
    personalInfo: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      company: { type: String, required: true },
      addtionalInfo: { type: String, required: true
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IProjectRequest>("ProjectRequest", ProjectRequestSchema);

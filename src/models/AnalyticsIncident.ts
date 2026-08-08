import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsIncidentSeverity = "info" | "warning" | "critical";
export type AnalyticsIncidentStatus = "open" | "acknowledged" | "resolved";

export interface IAnalyticsIncident extends Document {
  fingerprint: string;
  type: string;
  source: string;
  severity: AnalyticsIncidentSeverity;
  status: AnalyticsIncidentStatus;
  title: string;
  message: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  changePercent: number;
  threshold: number;
  occurrences: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedByEmail?: string;
  resolvedAt?: Date;
  resolvedByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsIncidentSchema = new Schema<IAnalyticsIncident>(
  {
    fingerprint: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    type: { type: String, required: true, trim: true, maxlength: 80, index: true },
    source: { type: String, required: true, trim: true, maxlength: 40, default: "server" },
    severity: {
      type: String,
      required: true,
      enum: ["info", "warning", "critical"],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["open", "acknowledged", "resolved"],
      default: "open",
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 600 },
    metric: { type: String, required: true, trim: true, maxlength: 80 },
    currentValue: { type: Number, required: true, default: 0 },
    baselineValue: { type: Number, required: true, default: 0 },
    changePercent: { type: Number, required: true, default: 0 },
    threshold: { type: Number, required: true, default: 0 },
    occurrences: { type: Number, required: true, min: 1, default: 1 },
    firstDetectedAt: { type: Date, required: true, default: Date.now },
    lastDetectedAt: { type: Date, required: true, default: Date.now },
    acknowledgedAt: { type: Date },
    acknowledgedByEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
    resolvedAt: { type: Date },
    resolvedByEmail: { type: String, trim: true, lowercase: true, maxlength: 320 },
  },
  { timestamps: true, versionKey: false }
);

AnalyticsIncidentSchema.index({ status: 1, severity: 1, lastDetectedAt: -1 });

export default mongoose.model<IAnalyticsIncident>("AnalyticsIncident", AnalyticsIncidentSchema);

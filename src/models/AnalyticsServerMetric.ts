import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsServerMetricType =
  | "api_request"
  | "auth_attempt"
  | "form_submission"
  | "spam_blocked";

export interface IAnalyticsServerMetric extends Document {
  bucketStart: Date;
  metricType: AnalyticsServerMetricType;
  route: string;
  method: string;
  statusCode: number;
  outcome: string;
  category: string;
  country: string;
  isBot: boolean;
  botName: string;
  count: number;
  durationTotalMs: number;
  durationMaxMs: number;
  lastOccurredAt: Date;
}

const configuredRetentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 395);
const retentionDays = Number.isFinite(configuredRetentionDays)
  ? Math.max(30, configuredRetentionDays)
  : 395;

const AnalyticsServerMetricSchema = new Schema<IAnalyticsServerMetric>(
  {
    bucketStart: { type: Date, required: true },
    metricType: {
      type: String,
      required: true,
      enum: ["api_request", "auth_attempt", "form_submission", "spam_blocked"],
    },
    route: { type: String, required: true, trim: true, maxlength: 180, default: "unknown" },
    method: { type: String, required: true, trim: true, maxlength: 12, default: "UNKNOWN" },
    statusCode: { type: Number, required: true, min: 0, max: 999, default: 0 },
    outcome: { type: String, required: true, trim: true, maxlength: 40, default: "unknown" },
    category: { type: String, required: true, trim: true, maxlength: 80, default: "general" },
    country: { type: String, required: true, trim: true, maxlength: 4, default: "unknown" },
    isBot: { type: Boolean, required: true, default: false },
    botName: { type: String, required: true, trim: true, maxlength: 40, default: "none" },
    count: { type: Number, required: true, min: 0, default: 0 },
    durationTotalMs: { type: Number, required: true, min: 0, default: 0 },
    durationMaxMs: { type: Number, required: true, min: 0, default: 0 },
    lastOccurredAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false }
);

AnalyticsServerMetricSchema.index(
  {
    bucketStart: 1,
    metricType: 1,
    route: 1,
    method: 1,
    statusCode: 1,
    outcome: 1,
    category: 1,
    country: 1,
    isBot: 1,
    botName: 1,
  },
  { unique: true, name: "analytics_server_metric_bucket" }
);
AnalyticsServerMetricSchema.index({ metricType: 1, bucketStart: -1 });
AnalyticsServerMetricSchema.index(
  { bucketStart: 1 },
  { expireAfterSeconds: retentionDays * 24 * 60 * 60 }
);

export default mongoose.model<IAnalyticsServerMetric>(
  "AnalyticsServerMetric",
  AnalyticsServerMetricSchema
);

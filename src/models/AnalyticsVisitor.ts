import mongoose, { Document, Schema } from "mongoose";

export interface IAnalyticsVisitor extends Document {
  visitorId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstLocale?: string;
  lastLocale?: string;
  firstMarket?: string;
  lastMarket?: string;
  firstCountry?: string;
  lastCountry?: string;
  sessionCount: number;
  pageViewCount: number;
  eventCount: number;
}

const configuredRetentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 395);
const retentionDays = Number.isFinite(configuredRetentionDays)
  ? Math.max(30, configuredRetentionDays)
  : 395;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const AnalyticsVisitorSchema = new Schema<IAnalyticsVisitor>(
  {
    visitorId: { type: String, required: true, trim: true, maxlength: 80 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    firstLocale: { type: String, trim: true, maxlength: 12 },
    lastLocale: { type: String, trim: true, maxlength: 12 },
    firstMarket: { type: String, trim: true, maxlength: 24 },
    lastMarket: { type: String, trim: true, maxlength: 24 },
    firstCountry: { type: String, trim: true, maxlength: 4 },
    lastCountry: { type: String, trim: true, maxlength: 4 },
    sessionCount: { type: Number, default: 0, min: 0 },
    pageViewCount: { type: Number, default: 0, min: 0 },
    eventCount: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false }
);

AnalyticsVisitorSchema.index({ visitorId: 1 }, { unique: true });
AnalyticsVisitorSchema.index({ lastSeenAt: -1 });
AnalyticsVisitorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: retentionSeconds });

export default mongoose.model<IAnalyticsVisitor>("AnalyticsVisitor", AnalyticsVisitorSchema);

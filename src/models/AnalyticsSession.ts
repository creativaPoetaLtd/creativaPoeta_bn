import mongoose, { Document, Schema } from "mongoose";

export interface IAnalyticsSession extends Document {
  sessionId: string;
  visitorId: string;
  startedAt: Date;
  lastSeenAt: Date;
  landingPath: string;
  exitPath: string;
  locale?: string;
  market?: string;
  referrerHost?: string;
  trafficSource?: string;
  trafficMedium?: string;
  campaign?: string;
  country?: string;
  region?: string;
  city?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  isBot: boolean;
  botName?: string;
  isNewVisitor: boolean;
  pageViewCount: number;
  eventCount: number;
  engagementMs: number;
}

const configuredRetentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 395);
const retentionDays = Number.isFinite(configuredRetentionDays)
  ? Math.max(30, configuredRetentionDays)
  : 395;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const AnalyticsSessionSchema = new Schema<IAnalyticsSession>(
  {
    sessionId: { type: String, required: true, trim: true, maxlength: 80 },
    visitorId: { type: String, required: true, trim: true, maxlength: 80 },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    landingPath: { type: String, required: true, trim: true, maxlength: 500 },
    exitPath: { type: String, required: true, trim: true, maxlength: 500 },
    locale: { type: String, trim: true, maxlength: 12 },
    market: { type: String, trim: true, maxlength: 24 },
    referrerHost: { type: String, trim: true, maxlength: 255 },
    trafficSource: { type: String, trim: true, maxlength: 120 },
    trafficMedium: { type: String, trim: true, maxlength: 80 },
    campaign: { type: String, trim: true, maxlength: 160 },
    country: { type: String, trim: true, maxlength: 4 },
    region: { type: String, trim: true, maxlength: 12 },
    city: { type: String, trim: true, maxlength: 120 },
    deviceType: { type: String, trim: true, maxlength: 24 },
    browser: { type: String, trim: true, maxlength: 40 },
    os: { type: String, trim: true, maxlength: 40 },
    isBot: { type: Boolean, default: false },
    botName: { type: String, trim: true, maxlength: 40 },
    isNewVisitor: { type: Boolean, default: false },
    pageViewCount: { type: Number, default: 0, min: 0 },
    eventCount: { type: Number, default: 0, min: 0 },
    engagementMs: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false }
);

AnalyticsSessionSchema.index({ sessionId: 1 }, { unique: true });
AnalyticsSessionSchema.index({ visitorId: 1, startedAt: -1 });
AnalyticsSessionSchema.index({ startedAt: -1, isBot: 1 });
AnalyticsSessionSchema.index({ lastSeenAt: -1 });
AnalyticsSessionSchema.index({ lastSeenAt: -1, isBot: 1 });
AnalyticsSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: retentionSeconds });

export default mongoose.model<IAnalyticsSession>("AnalyticsSession", AnalyticsSessionSchema);

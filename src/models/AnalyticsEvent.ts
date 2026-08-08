import mongoose, { Document, Schema } from "mongoose";

export type AnalyticsEventType =
  | "page_view"
  | "engagement"
  | "scroll"
  | "click"
  | "form"
  | "conversion"
  | "web_vital"
  | "error"
  | "api_error"
  | "not_found";

export interface IAnalyticsEvent extends Document {
  eventId: string;
  visitorId: string;
  sessionId: string;
  eventType: AnalyticsEventType;
  eventName: string;
  occurredAt: Date;
  receivedAt: Date;
  path: string;
  pageTitle?: string;
  locale?: string;
  market?: string;
  referrerHost?: string;
  trafficSource?: string;
  trafficMedium?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  device?: {
    type?: string;
    browser?: string;
    os?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    isBot?: boolean;
    botName?: string;
  };
  geo?: {
    continent?: string;
    country?: string;
    region?: string;
    city?: string;
  };
  properties?: {
    label?: string;
    target?: string;
    form?: string;
    conversionType?: string;
    depth?: number;
    durationMs?: number;
    value?: number;
    metricName?: string;
    metricValue?: number;
    metricDelta?: number;
    metricRating?: string;
    metricId?: string;
    errorMessage?: string;
    errorSource?: string;
    line?: number;
    column?: number;
    statusCode?: number;
    endpoint?: string;
  };
}

const configuredRetentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 395);
const retentionDays = Number.isFinite(configuredRetentionDays)
  ? Math.max(30, configuredRetentionDays)
  : 395;
const retentionSeconds = retentionDays * 24 * 60 * 60;

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventId: { type: String, required: true, trim: true, maxlength: 80 },
    visitorId: { type: String, required: true, trim: true, maxlength: 80 },
    sessionId: { type: String, required: true, trim: true, maxlength: 80 },
    eventType: {
      type: String,
      required: true,
      enum: [
        "page_view",
        "engagement",
        "scroll",
        "click",
        "form",
        "conversion",
        "web_vital",
        "error",
        "api_error",
        "not_found",
      ],
    },
    eventName: { type: String, required: true, trim: true, maxlength: 80 },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
    path: { type: String, required: true, trim: true, maxlength: 500 },
    pageTitle: { type: String, trim: true, maxlength: 200 },
    locale: { type: String, trim: true, maxlength: 12 },
    market: { type: String, trim: true, maxlength: 24 },
    referrerHost: { type: String, trim: true, maxlength: 255 },
    trafficSource: { type: String, trim: true, maxlength: 120 },
    trafficMedium: { type: String, trim: true, maxlength: 80 },
    utm: {
      source: { type: String, trim: true, maxlength: 120 },
      medium: { type: String, trim: true, maxlength: 80 },
      campaign: { type: String, trim: true, maxlength: 160 },
      content: { type: String, trim: true, maxlength: 160 },
      term: { type: String, trim: true, maxlength: 160 },
    },
    device: {
      type: { type: String, trim: true, maxlength: 24 },
      browser: { type: String, trim: true, maxlength: 40 },
      os: { type: String, trim: true, maxlength: 40 },
      viewportWidth: { type: Number, min: 0, max: 20000 },
      viewportHeight: { type: Number, min: 0, max: 20000 },
      isBot: { type: Boolean, default: false },
      botName: { type: String, trim: true, maxlength: 40 },
    },
    geo: {
      continent: { type: String, trim: true, maxlength: 4 },
      country: { type: String, trim: true, maxlength: 4 },
      region: { type: String, trim: true, maxlength: 12 },
      city: { type: String, trim: true, maxlength: 120 },
    },
    properties: {
      label: { type: String, trim: true, maxlength: 120 },
      target: { type: String, trim: true, maxlength: 300 },
      form: { type: String, trim: true, maxlength: 120 },
      conversionType: { type: String, trim: true, maxlength: 80 },
      depth: { type: Number, min: 0, max: 100 },
      durationMs: { type: Number, min: 0, max: 86_400_000 },
      value: { type: Number, min: -1_000_000_000, max: 1_000_000_000 },
      metricName: { type: String, trim: true, maxlength: 20 },
      metricValue: { type: Number, min: 0, max: 86_400_000 },
      metricDelta: { type: Number, min: 0, max: 86_400_000 },
      metricRating: { type: String, trim: true, maxlength: 24 },
      metricId: { type: String, trim: true, maxlength: 120 },
      errorMessage: { type: String, trim: true, maxlength: 300 },
      errorSource: { type: String, trim: true, maxlength: 300 },
      line: { type: Number, min: 0, max: 10_000_000 },
      column: { type: Number, min: 0, max: 10_000_000 },
      statusCode: { type: Number, min: 0, max: 999 },
      endpoint: { type: String, trim: true, maxlength: 300 },
    },
  },
  { versionKey: false, strict: true }
);

AnalyticsEventSchema.index({ eventId: 1 }, { unique: true });
AnalyticsEventSchema.index({ occurredAt: -1 });
AnalyticsEventSchema.index({ eventType: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ visitorId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ sessionId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: retentionSeconds });

export default mongoose.model<IAnalyticsEvent>("AnalyticsEvent", AnalyticsEventSchema);

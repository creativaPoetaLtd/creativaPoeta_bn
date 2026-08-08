"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const configuredRetentionDays = Number(process.env.ANALYTICS_RETENTION_DAYS || 395);
const retentionDays = Number.isFinite(configuredRetentionDays)
    ? Math.max(30, configuredRetentionDays)
    : 395;
const retentionSeconds = retentionDays * 24 * 60 * 60;
const AnalyticsEventSchema = new mongoose_1.Schema({
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
        durationMs: { type: Number, min: 0, max: 86400000 },
        value: { type: Number, min: -1000000000, max: 1000000000 },
        metricName: { type: String, trim: true, maxlength: 20 },
        metricValue: { type: Number, min: 0, max: 86400000 },
        metricDelta: { type: Number, min: 0, max: 86400000 },
        metricRating: { type: String, trim: true, maxlength: 24 },
        metricId: { type: String, trim: true, maxlength: 120 },
        errorMessage: { type: String, trim: true, maxlength: 300 },
        errorSource: { type: String, trim: true, maxlength: 300 },
        line: { type: Number, min: 0, max: 10000000 },
        column: { type: Number, min: 0, max: 10000000 },
        statusCode: { type: Number, min: 0, max: 999 },
        endpoint: { type: String, trim: true, maxlength: 300 },
    },
}, { versionKey: false, strict: true });
AnalyticsEventSchema.index({ eventId: 1 }, { unique: true });
AnalyticsEventSchema.index({ occurredAt: -1 });
AnalyticsEventSchema.index({ eventType: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ visitorId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ sessionId: 1, occurredAt: -1 });
AnalyticsEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: retentionSeconds });
exports.default = mongoose_1.default.model("AnalyticsEvent", AnalyticsEventSchema);

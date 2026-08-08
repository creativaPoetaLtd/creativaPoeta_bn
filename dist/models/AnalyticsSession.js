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
const AnalyticsSessionSchema = new mongoose_1.Schema({
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
}, { versionKey: false });
AnalyticsSessionSchema.index({ sessionId: 1 }, { unique: true });
AnalyticsSessionSchema.index({ visitorId: 1, startedAt: -1 });
AnalyticsSessionSchema.index({ lastSeenAt: -1 });
AnalyticsSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: retentionSeconds });
exports.default = mongoose_1.default.model("AnalyticsSession", AnalyticsSessionSchema);

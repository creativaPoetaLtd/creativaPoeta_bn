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
const AnalyticsServerMetricSchema = new mongoose_1.Schema({
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
}, { versionKey: false });
AnalyticsServerMetricSchema.index({
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
}, { unique: true, name: "analytics_server_metric_bucket" });
AnalyticsServerMetricSchema.index({ metricType: 1, bucketStart: -1 });
AnalyticsServerMetricSchema.index({ bucketStart: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });
exports.default = mongoose_1.default.model("AnalyticsServerMetric", AnalyticsServerMetricSchema);

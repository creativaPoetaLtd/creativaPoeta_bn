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
const AnalyticsVisitorSchema = new mongoose_1.Schema({
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
}, { versionKey: false });
AnalyticsVisitorSchema.index({ visitorId: 1 }, { unique: true });
AnalyticsVisitorSchema.index({ lastSeenAt: -1 });
AnalyticsVisitorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: retentionSeconds });
exports.default = mongoose_1.default.model("AnalyticsVisitor", AnalyticsVisitorSchema);

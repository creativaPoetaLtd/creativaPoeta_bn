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
const AnalyticsIncidentSchema = new mongoose_1.Schema({
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
}, { timestamps: true, versionKey: false });
AnalyticsIncidentSchema.index({ status: 1, severity: 1, lastDetectedAt: -1 });
exports.default = mongoose_1.default.model("AnalyticsIncident", AnalyticsIncidentSchema);

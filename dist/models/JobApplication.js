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
const JobApplicationSchema = new mongoose_1.Schema({
    kind: { type: String, enum: ["job", "spontaneous"], default: "spontaneous", index: true },
    job: { type: mongoose_1.Schema.Types.ObjectId, ref: "Job", index: true },
    jobTitle: { type: String, trim: true, maxlength: 180 },
    fullName: { type: String, required: true, trim: true, maxlength: 180 },
    email: { type: String, trim: true, lowercase: true, maxlength: 240 },
    phone: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 120 },
    desiredRole: { type: String, trim: true, maxlength: 180 },
    experience: { type: String, trim: true, maxlength: 180 },
    skills: { type: String, trim: true, maxlength: 2000 },
    linkedin: { type: String, trim: true, maxlength: 500 },
    portfolio: { type: String, trim: true, maxlength: 500 },
    hasCv: { type: Boolean, default: false },
    cvOriginalName: { type: String, trim: true, maxlength: 240 },
    cvMimeType: { type: String, trim: true, maxlength: 160 },
    discoverySource: { type: String, trim: true, maxlength: 80, index: true },
    discoverySourceOther: { type: String, trim: true, maxlength: 300 },
    availability: { type: String, trim: true, maxlength: 180 },
    message: { type: String, trim: true, maxlength: 5000 },
    locale: { type: String, trim: true, maxlength: 12 },
    status: { type: String, enum: ["new", "reviewing", "shortlisted", "rejected", "archived"], default: "new", index: true },
    consentAcceptedAt: { type: Date, required: true },
    reviewedByEmail: { type: String, trim: true, lowercase: true },
    reviewedAt: { type: Date },
}, { timestamps: true });
JobApplicationSchema.index({ status: 1, createdAt: -1 });
JobApplicationSchema.index({ email: 1, createdAt: -1 });
exports.default = mongoose_1.default.model("JobApplication", JobApplicationSchema);

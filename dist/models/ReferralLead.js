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
const ReferralLeadSchema = new mongoose_1.Schema({
    partner: { type: mongoose_1.Schema.Types.ObjectId, ref: "ReferralPartner", required: true },
    partnerId: { type: String, required: true, trim: true, uppercase: true },
    partnerName: { type: String, required: true, trim: true },
    partnerEmail: { type: String, required: true, trim: true, lowercase: true },
    companyName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    website: { type: String, trim: true, lowercase: true },
    serviceNeeded: { type: String, required: true, trim: true },
    budgetRange: { type: String, trim: true },
    needDescription: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    consentStatus: { type: String, enum: ["agreed", "not_yet", "prospect_submitted"], default: "not_yet" },
    introductionMethod: { type: String, required: true, trim: true },
    introductionDetails: { type: String, trim: true },
    locale: { type: String, trim: true, default: "fr" },
    status: { type: String, enum: ["submitted", "waiting_for_introduction", "under_review", "accepted", "duplicate", "rejected", "contacted", "qualified", "proposal_sent", "won", "lost"], default: "submitted" },
    eligibility: { type: String, enum: ["pending", "eligible", "ineligible"], default: "pending" },
    decisionReason: { type: String, trim: true },
    assignedToEmail: { type: String, trim: true, lowercase: true },
    assignedToName: { type: String, trim: true },
    assignedAt: { type: Date },
    activity: [{
            type: { type: String, enum: ["submitted", "assigned", "released", "status", "eligibility", "note"], required: true },
            message: { type: String, required: true },
            actorEmail: { type: String, trim: true, lowercase: true },
            actorName: { type: String, trim: true },
            at: { type: Date, default: Date.now },
        }],
}, { timestamps: true });
ReferralLeadSchema.index({ status: 1, createdAt: -1 });
ReferralLeadSchema.index({ partner: 1, createdAt: -1 });
ReferralLeadSchema.index({ contactEmail: 1, createdAt: -1 });
ReferralLeadSchema.index({ website: 1, createdAt: -1 });
ReferralLeadSchema.index({ companyName: 1, createdAt: -1 });
exports.default = mongoose_1.default.model("ReferralLead", ReferralLeadSchema);

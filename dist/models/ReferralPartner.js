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
const ReferralPartnerSchema = new mongoose_1.Schema({
    partnerId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    referralCode: { type: String, trim: true, unique: true, sparse: true, select: false },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    country: { type: String, required: true, trim: true },
    locale: { type: String, trim: true, default: "fr" },
    profileType: { type: String, required: true, trim: true },
    program: { type: String, enum: ["referral", "business"], default: "referral" },
    website: { type: String, trim: true },
    networkDescription: { type: String, trim: true },
    status: { type: String, enum: ["pending", "approved", "active", "rejected", "suspended", "closed"], default: "pending" },
    termsVersion: { type: String, required: true, trim: true },
    termsAcceptedAt: { type: Date, required: true },
    marketingConsent: { type: Boolean, default: false },
    accessSecretHash: { type: String, select: false },
    reviewedAt: { type: Date },
    reviewedBy: { type: String, trim: true, lowercase: true },
    rejectionReason: { type: String, trim: true },
    activity: [{
            type: { type: String, enum: ["application", "status", "access", "note"], required: true },
            message: { type: String, required: true },
            actorEmail: { type: String, trim: true, lowercase: true },
            actorName: { type: String, trim: true },
            at: { type: Date, default: Date.now },
        }],
}, {
    timestamps: true,
    toJSON: {
        transform: (_document, returned) => {
            delete returned.accessSecretHash;
            return returned;
        },
    },
});
ReferralPartnerSchema.index({ email: 1, status: 1 });
ReferralPartnerSchema.index({ status: 1, createdAt: -1 });
ReferralPartnerSchema.index({ program: 1, status: 1 });
exports.default = mongoose_1.default.model("ReferralPartner", ReferralPartnerSchema);

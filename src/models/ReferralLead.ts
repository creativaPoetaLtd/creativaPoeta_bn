import mongoose, { Document, Schema, Types } from "mongoose";

export type ReferralLeadStatus = "submitted" | "waiting_for_introduction" | "under_review" | "accepted" | "duplicate" | "rejected" | "contacted" | "qualified" | "proposal_sent" | "won" | "lost";

export interface IReferralLead extends Document {
  partner: Types.ObjectId;
  partnerId: string;
  partnerName: string;
  partnerEmail: string;
  companyName: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  serviceNeeded: string;
  budgetRange?: string;
  needDescription: string;
  relationship: string;
  consentStatus: "agreed" | "not_yet" | "prospect_submitted";
  introductionMethod: string;
  introductionDetails?: string;
  locale: string;
  status: ReferralLeadStatus;
  eligibility: "pending" | "eligible" | "ineligible";
  decisionReason?: string;
  assignedToEmail?: string;
  assignedToName?: string;
  assignedAt?: Date;
  activity: Array<{
    type: "submitted" | "assigned" | "released" | "status" | "eligibility" | "note";
    message: string;
    actorEmail?: string;
    actorName?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralLeadSchema = new Schema<IReferralLead>(
  {
    partner: { type: Schema.Types.ObjectId, ref: "ReferralPartner", required: true },
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
  },
  { timestamps: true }
);

ReferralLeadSchema.index({ status: 1, createdAt: -1 });
ReferralLeadSchema.index({ partner: 1, createdAt: -1 });
ReferralLeadSchema.index({ contactEmail: 1, createdAt: -1 });
ReferralLeadSchema.index({ website: 1, createdAt: -1 });
ReferralLeadSchema.index({ companyName: 1, createdAt: -1 });

export default mongoose.model<IReferralLead>("ReferralLead", ReferralLeadSchema);

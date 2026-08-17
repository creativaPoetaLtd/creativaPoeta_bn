import mongoose, { Document, Schema } from "mongoose";

export type ReferralPartnerProgram = "referral" | "business";
export type ReferralPartnerStatus = "pending" | "approved" | "active" | "rejected" | "suspended" | "closed";
export type ReferralContactChannel = "email" | "whatsapp" | "phone" | "sms" | "other";
export type ReferralNotificationStatus = "sent" | "delivered" | "read" | "failed" | "manual_required";

export interface IReferralNotificationDelivery {
  kind: "approval" | "rejection";
  requestedChannel: ReferralContactChannel;
  deliveredChannel?: "email" | "whatsapp";
  status: ReferralNotificationStatus;
  fallbackUsed: boolean;
  providerMessageId?: string;
  error?: string;
  attemptedAt: Date;
  updatedAt: Date;
}

export interface IReferralPartner extends Document {
  partnerId?: string;
  referralCode?: string;
  name: string;
  email?: string;
  phone?: string;
  preferredContact: ReferralContactChannel;
  country: string;
  locale: string;
  profileType: string;
  program: ReferralPartnerProgram;
  website?: string;
  networkDescription?: string;
  status: ReferralPartnerStatus;
  termsVersion: string;
  termsAcceptedAt: Date;
  marketingConsent: boolean;
  accessSecretHash?: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  accessRecoveryStatus?: "pending" | "resolved";
  accessRecoveryRequestedAt?: Date;
  accessRecoveryResolvedAt?: Date;
  accessRecoveryRequestCount: number;
  lastNotification?: IReferralNotificationDelivery;
  activity: Array<{
    type: "application" | "status" | "access" | "note";
    message: string;
    actorEmail?: string;
    actorName?: string;
    at: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralPartnerSchema = new Schema<IReferralPartner>(
  {
    partnerId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    referralCode: { type: String, trim: true, unique: true, sparse: true, select: false },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    preferredContact: { type: String, enum: ["email", "whatsapp", "phone", "sms", "other"], default: "email" },
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
    accessRecoveryStatus: { type: String, enum: ["pending", "resolved"] },
    accessRecoveryRequestedAt: { type: Date },
    accessRecoveryResolvedAt: { type: Date },
    accessRecoveryRequestCount: { type: Number, default: 0, min: 0 },
    lastNotification: {
      kind: { type: String, enum: ["approval", "rejection"] },
      requestedChannel: { type: String, enum: ["email", "whatsapp", "phone", "sms", "other"] },
      deliveredChannel: { type: String, enum: ["email", "whatsapp"] },
      status: { type: String, enum: ["sent", "delivered", "read", "failed", "manual_required"] },
      fallbackUsed: { type: Boolean, default: false },
      providerMessageId: { type: String, trim: true },
      error: { type: String, trim: true, maxlength: 500 },
      attemptedAt: { type: Date },
      updatedAt: { type: Date },
    },
    activity: [{
      type: { type: String, enum: ["application", "status", "access", "note"], required: true },
      message: { type: String, required: true },
      actorEmail: { type: String, trim: true, lowercase: true },
      actorName: { type: String, trim: true },
      at: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, returned) => {
        delete returned.accessSecretHash;
        return returned;
      },
    },
  }
);

ReferralPartnerSchema.index({ email: 1, status: 1 });
ReferralPartnerSchema.index({ phone: 1, status: 1 });
ReferralPartnerSchema.index({ status: 1, createdAt: -1 });
ReferralPartnerSchema.index({ program: 1, status: 1 });
ReferralPartnerSchema.index({ accessRecoveryStatus: 1, accessRecoveryRequestedAt: -1 });

export default mongoose.model<IReferralPartner>("ReferralPartner", ReferralPartnerSchema);

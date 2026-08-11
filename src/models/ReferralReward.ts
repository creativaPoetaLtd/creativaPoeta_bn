import mongoose, { Document, Schema, Types } from "mongoose";

export type ReferralRewardStatus = "waiting_client_payment" | "earned" | "approved" | "scheduled" | "paid" | "cancelled";

export interface IReferralReward extends Document {
  lead: Types.ObjectId;
  partner: Types.ObjectId;
  partnerId: string;
  currency: string;
  eligibleRevenueCents: number;
  rateBasisPoints: number;
  capCents: number;
  amountCents: number;
  status: ReferralRewardStatus;
  paymentReference?: string;
  paidAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  activity: Array<{ message: string; actorEmail?: string; actorName?: string; at: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralRewardSchema = new Schema<IReferralReward>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "ReferralLead", required: true, unique: true },
    partner: { type: Schema.Types.ObjectId, ref: "ReferralPartner", required: true },
    partnerId: { type: String, required: true, trim: true, uppercase: true },
    currency: { type: String, trim: true, uppercase: true, default: "EUR" },
    eligibleRevenueCents: { type: Number, min: 0, default: 0 },
    rateBasisPoints: { type: Number, min: 0, max: 10000, default: 1000 },
    capCents: { type: Number, min: 0, default: 0 },
    amountCents: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ["waiting_client_payment", "earned", "approved", "scheduled", "paid", "cancelled"], default: "waiting_client_payment" },
    paymentReference: { type: String, trim: true },
    paidAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: String, trim: true, lowercase: true },
    activity: [{
      message: { type: String, required: true },
      actorEmail: { type: String, trim: true, lowercase: true },
      actorName: { type: String, trim: true },
      at: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

ReferralRewardSchema.index({ status: 1, createdAt: -1 });
ReferralRewardSchema.index({ partner: 1, createdAt: -1 });

export default mongoose.model<IReferralReward>("ReferralReward", ReferralRewardSchema);

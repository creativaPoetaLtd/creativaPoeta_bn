import mongoose, { Document, Schema } from "mongoose";

export interface IReferralRateLimit extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const ReferralRateLimitSchema = new Schema<IReferralRateLimit>(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

ReferralRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IReferralRateLimit>("ReferralRateLimit", ReferralRateLimitSchema);

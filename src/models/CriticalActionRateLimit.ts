import mongoose, { Document, Schema } from "mongoose";

export interface ICriticalActionRateLimit extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const CriticalActionRateLimitSchema = new Schema<ICriticalActionRateLimit>(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false }
);

CriticalActionRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<ICriticalActionRateLimit>("CriticalActionRateLimit", CriticalActionRateLimitSchema);

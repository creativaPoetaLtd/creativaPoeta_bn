import mongoose, { Schema } from "mongoose";
import { softDeletePlugin } from "../plugins/softDeletePlugin";
const schema = new Schema({
  reference: { type: String, required: true, unique: true },
  idempotencyKey: { type: String, required: true, unique: true, select: false },
  requestFingerprint: { type: String, required: true, select: false },
  name: { type: String, required: true, maxlength: 120 }, email: { type: String, required: true, maxlength: 254 },
  locale: { type: String, enum: ["fr", "en", "nl"], default: "fr" }, message: { type: String, maxlength: 3000 },
  consent: { type: Boolean, required: true }, consentAt: { type: Date, required: true },
  quote: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
  paymentStatus: { type: String, enum: ["not_requested"], default: "not_requested", immutable: true },
  internalNote: { type: String, maxlength: 3000, default: "" },
}, { timestamps: true });
schema.plugin(softDeletePlugin, { entityType: "art_request" });
schema.index({ status: 1, createdAt: -1 });
export default mongoose.model("ArtRequest", schema);

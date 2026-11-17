import mongoose, { Schema } from "mongoose";
import { recordAuditEvent } from "../services/auditService";
import { softDeletePlugin } from "../plugins/softDeletePlugin";
const schema = new Schema({
  reference: { type: String, required: true, unique: true, immutable: true },
  idempotencyKey: { type: String, required: true, unique: true, select: false, immutable: true },
  fingerprint: { type: String, required: true, select: false, immutable: true },
  accessHash: { type: String, required: true, select: false, immutable: true },
  mode: { type: String, enum: ["test", "live"], required: true, immutable: true },
  quote: { type: Schema.Types.Mixed, required: true, immutable: true },
  checkoutInput: { type: Schema.Types.Mixed, required: true, select: false, immutable: true },
  termsVersion: { type: String, required: true, immutable: true }, termsAcceptedAt: { type: Date, required: true, immutable: true },
  sessionId: { type: String, select: false }, checkoutUrl: { type: String, select: false }, expiresAt: { type: Date, required: true, immutable: true },
  paymentIntentId: { type: String, select: false },
  paymentStatus: { type: String, enum: ["pending", "paid", "failed", "expired", "review_required", "refunded", "partially_refunded"], default: "pending" },
  paidAt: Date, customer: { type: Schema.Types.Mixed }, refundedCents: { type: Number, default: 0 },
  fulfillmentStatus: { type: String, enum: ["unprocessed", "preparing", "shipped", "delivered", "on_hold"], default: "unprocessed" },
  trackingUrl: { type: String, maxlength: 500, default: "" }, internalNote: { type: String, maxlength: 3000, default: "" },
  processedEvents: { type: [String], default: [], select: false },
}, { timestamps: true });
// Financial changes are audited without copying private receipt/session credentials.
schema.plugin(softDeletePlugin, { entityType: "art_order", audit: false });
schema.pre("save", function (this: any) { this.$locals.artWasNew = this.isNew; });
schema.post("save", async function (this: any) {
  await recordAuditEvent({ entityType: "art_order", entityId: String(this._id), action: this.$locals.artWasNew ? "create" : "update", after: { reference: this.reference, mode: this.mode, paymentStatus: this.paymentStatus, fulfillmentStatus: this.fulfillmentStatus, totalCents: this.quote?.totalCents, refundedCents: this.refundedCents, version: this.__v } });
});
schema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $type: "string" } } });
schema.index({ paymentIntentId: 1 });
schema.index({ createdAt: -1 });
export default mongoose.model("ArtOrder", schema);

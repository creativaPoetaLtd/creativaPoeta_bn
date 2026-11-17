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
const auditService_1 = require("../services/auditService");
const softDeletePlugin_1 = require("../plugins/softDeletePlugin");
const schema = new mongoose_1.Schema({
    reference: { type: String, required: true, unique: true, immutable: true },
    idempotencyKey: { type: String, required: true, unique: true, select: false, immutable: true },
    fingerprint: { type: String, required: true, select: false, immutable: true },
    accessHash: { type: String, required: true, select: false, immutable: true },
    mode: { type: String, enum: ["test", "live"], required: true, immutable: true },
    quote: { type: mongoose_1.Schema.Types.Mixed, required: true, immutable: true },
    checkoutInput: { type: mongoose_1.Schema.Types.Mixed, required: true, select: false, immutable: true },
    termsVersion: { type: String, required: true, immutable: true }, termsAcceptedAt: { type: Date, required: true, immutable: true },
    sessionId: { type: String, select: false }, checkoutUrl: { type: String, select: false }, expiresAt: { type: Date, required: true, immutable: true },
    paymentIntentId: { type: String, select: false },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "expired", "review_required", "refunded", "partially_refunded"], default: "pending" },
    paidAt: Date, customer: { type: mongoose_1.Schema.Types.Mixed }, refundedCents: { type: Number, default: 0 },
    fulfillmentStatus: { type: String, enum: ["unprocessed", "preparing", "shipped", "delivered", "on_hold"], default: "unprocessed" },
    trackingUrl: { type: String, maxlength: 500, default: "" }, internalNote: { type: String, maxlength: 3000, default: "" },
    processedEvents: { type: [String], default: [], select: false },
}, { timestamps: true });
// Financial changes are audited without copying private receipt/session credentials.
schema.plugin(softDeletePlugin_1.softDeletePlugin, { entityType: "art_order", audit: false });
schema.pre("save", function () { this.$locals.artWasNew = this.isNew; });
schema.post("save", async function () {
    var _a;
    await (0, auditService_1.recordAuditEvent)({ entityType: "art_order", entityId: String(this._id), action: this.$locals.artWasNew ? "create" : "update", after: { reference: this.reference, mode: this.mode, paymentStatus: this.paymentStatus, fulfillmentStatus: this.fulfillmentStatus, totalCents: (_a = this.quote) === null || _a === void 0 ? void 0 : _a.totalCents, refundedCents: this.refundedCents, version: this.__v } });
});
schema.index({ sessionId: 1 }, { unique: true, partialFilterExpression: { sessionId: { $type: "string" } } });
schema.index({ paymentIntentId: 1 });
schema.index({ createdAt: -1 });
exports.default = mongoose_1.default.model("ArtOrder", schema);

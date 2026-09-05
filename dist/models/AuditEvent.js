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
const AuditEventSchema = new mongoose_1.Schema({
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    action: { type: String, enum: ["create", "update", "delete", "restore", "purge_request", "purge", "rollback"], required: true, index: true },
    before: { type: mongoose_1.Schema.Types.Mixed, select: false },
    after: { type: mongoose_1.Schema.Types.Mixed, select: false },
    changedPaths: { type: [String], default: [] },
    actorId: { type: String, trim: true },
    actorEmail: { type: String, trim: true, lowercase: true },
    actorName: { type: String, trim: true },
    actorRole: { type: String, trim: true },
    requestId: { type: String, trim: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
AuditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditEventSchema.index({ actorEmail: 1, createdAt: -1 });
const immutableError = () => new Error("Audit events are immutable.");
AuditEventSchema.pre("save", function (next) {
    if (!this.isNew)
        return next(immutableError());
    next();
});
AuditEventSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"], function (next) {
    next(immutableError());
});
exports.default = mongoose_1.default.model("AuditEvent", AuditEventSchema);

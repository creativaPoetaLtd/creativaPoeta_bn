import mongoose, { Document, Schema } from "mongoose";

export type AuditAction = "create" | "update" | "delete" | "restore" | "purge_request" | "purge" | "rollback";

export interface IAuditEvent extends Document {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changedPaths: string[];
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  requestId?: string;
  createdAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    action: { type: String, enum: ["create", "update", "delete", "restore", "purge_request", "purge", "rollback"], required: true, index: true },
    before: { type: Schema.Types.Mixed, select: false },
    after: { type: Schema.Types.Mixed, select: false },
    changedPaths: { type: [String], default: [] },
    actorId: { type: String, trim: true },
    actorEmail: { type: String, trim: true, lowercase: true },
    actorName: { type: String, trim: true },
    actorRole: { type: String, trim: true },
    requestId: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
AuditEventSchema.index({ actorEmail: 1, createdAt: -1 });

const immutableError = () => new Error("Audit events are immutable.");
AuditEventSchema.pre("save", function (next) {
  if (!this.isNew) return next(immutableError());
  next();
});
AuditEventSchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"], function (next) {
  next(immutableError());
});

export default mongoose.model<IAuditEvent>("AuditEvent", AuditEventSchema);

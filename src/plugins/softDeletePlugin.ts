import { Schema } from "mongoose";
import { recordAuditEvent } from "../services/auditService";

const snapshot = (document: any) => document?.toObject
  ? document.toObject({ depopulate: true, virtuals: false, getters: false, transform: false })
  : document;

const includeDeleted = (query: any) => Boolean(query.getOptions?.().includeDeleted);

const enforceValidatedUpdate = (query: any) => {
  query.setOptions?.({ runValidators: true, context: "query" });
};

export const softDeletePlugin = (schema: Schema, options: { entityType: string; audit?: boolean }) => {
  // Prevent a stale document instance from silently overwriting a newer save.
  // This remains useful for high-volume sync models even when detailed update
  // snapshots are disabled. Query updates are validated by the hooks below.
  schema.set("optimisticConcurrency", true);

  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedById: { type: String, trim: true },
    deletedByEmail: { type: String, trim: true, lowercase: true },
    deletedByName: { type: String, trim: true },
    deleteReason: { type: String, trim: true, maxlength: 1000 },
  });
  schema.index({ isDeleted: 1, deletedAt: -1 });

  ["find", "findOne", "countDocuments", "distinct", "updateOne", "updateMany", "findOneAndUpdate"].forEach((operation) => {
    schema.pre(operation as any, function (this: any, next: (error?: Error) => void) {
      if (!includeDeleted(this) && this.getQuery?.().isDeleted === undefined) this.where({ isDeleted: { $ne: true } });
      if (["updateOne", "updateMany", "findOneAndUpdate"].includes(operation)) enforceValidatedUpdate(this);
      next();
    });
  });

  schema.pre("aggregate", function (this: any, next: (error?: Error) => void) {
    if (!this.options?.includeDeleted) {
      const pipeline = this.pipeline();
      const firstStage = Object.keys(pipeline[0] || {})[0];
      const protectedFirstStages = ["$geoNear", "$search", "$searchMeta", "$vectorSearch"];
      pipeline.splice(protectedFirstStages.includes(firstStage) ? 1 : 0, 0, { $match: { isDeleted: { $ne: true } } });
    }
    next();
  });

  ["deleteOne", "deleteMany", "findOneAndDelete"].forEach((operation) => {
    schema.pre(operation as any, function (this: any, next: (error?: Error) => void) {
      next(new Error("Physical deletion is disabled for protected records."));
    });
  });
  schema.pre("deleteOne", { document: true, query: false }, function (this: any, next: (error?: Error) => void) {
    next(new Error("Physical deletion is disabled for protected records."));
  });

  // Full-document replacements can silently remove soft-delete metadata and
  // unrelated fields. Normal edits must use validated update/save operations.
  ["replaceOne", "findOneAndReplace"].forEach((operation) => {
    schema.pre(operation as any, function (this: any, next: (error?: Error) => void) {
      next(new Error("Full-document replacement is disabled for protected records."));
    });
  });

  if (options.audit !== false) {
    schema.pre("save", async function (this: any) {
      if (this.isNew || this.$locals.skipAudit) return;
      this.$locals.auditBefore = await this.constructor.findOne({ _id: this._id }).setOptions({ includeDeleted: true }).lean();
    });
    schema.post("save", async function (this: any) {
      if (this.$locals.skipAudit) return;
      await recordAuditEvent({
        entityType: options.entityType,
        entityId: String(this._id),
        action: this.$locals.auditBefore ? "update" : "create",
        before: this.$locals.auditBefore,
        after: snapshot(this),
      });
    });
    schema.pre("findOneAndUpdate", async function (this: any) {
      if (this.getOptions?.().skipAudit) return;
      this._auditBefore = await this.model.findOne(this.getQuery()).setOptions({ includeDeleted: true }).lean();
    });
    schema.post("findOneAndUpdate", async function (this: any) {
      if (this.getOptions?.().skipAudit) return;
      if (!this._auditBefore?._id) return;
      const after = await this.model.findOne({ _id: this._auditBefore._id }).setOptions({ includeDeleted: true }).lean();
      await recordAuditEvent({
        entityType: options.entityType,
        entityId: String(this._auditBefore._id),
        action: "update",
        before: this._auditBefore,
        after,
      });
    });

    ["updateOne", "updateMany"].forEach((operation) => {
      schema.pre(operation as any, async function (this: any) {
        if (this.getOptions?.().skipAudit) return;
        this._auditBeforeMany = await this.model
          .find(this.getQuery())
          .setOptions({ includeDeleted: true })
          .limit(101)
          .lean();
      });
      schema.post(operation as any, async function (this: any) {
        if (this.getOptions?.().skipAudit || !Array.isArray(this._auditBeforeMany)) return;
        const tracked = this._auditBeforeMany.slice(0, 100);
        for (const before of tracked) {
          const after = await this.model.findById(before._id).setOptions({ includeDeleted: true }).lean();
          await recordAuditEvent({
            entityType: options.entityType,
            entityId: String(before._id),
            action: "update",
            before,
            after,
          });
        }
        if (this._auditBeforeMany.length > 100) {
          await recordAuditEvent({
            entityType: options.entityType,
            entityId: "bulk-update",
            action: "update",
            before: { tracked: 100, truncated: true },
            after: { matchedMoreThan: 100 },
          });
        }
      });
    });
  }
};

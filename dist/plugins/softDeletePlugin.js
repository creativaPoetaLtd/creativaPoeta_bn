"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.softDeletePlugin = void 0;
const auditService_1 = require("../services/auditService");
const snapshot = (document) => (document === null || document === void 0 ? void 0 : document.toObject)
    ? document.toObject({ depopulate: true, virtuals: false, getters: false, transform: false })
    : document;
const includeDeleted = (query) => { var _a; return Boolean((_a = query.getOptions) === null || _a === void 0 ? void 0 : _a.call(query).includeDeleted); };
const enforceValidatedUpdate = (query) => {
    var _a;
    (_a = query.setOptions) === null || _a === void 0 ? void 0 : _a.call(query, { runValidators: true, context: "query" });
};
const softDeletePlugin = (schema, options) => {
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
        schema.pre(operation, function (next) {
            var _a;
            if (!includeDeleted(this) && ((_a = this.getQuery) === null || _a === void 0 ? void 0 : _a.call(this).isDeleted) === undefined)
                this.where({ isDeleted: { $ne: true } });
            if (["updateOne", "updateMany", "findOneAndUpdate"].includes(operation))
                enforceValidatedUpdate(this);
            next();
        });
    });
    schema.pre("aggregate", function (next) {
        var _a;
        if (!((_a = this.options) === null || _a === void 0 ? void 0 : _a.includeDeleted)) {
            const pipeline = this.pipeline();
            const firstStage = Object.keys(pipeline[0] || {})[0];
            const protectedFirstStages = ["$geoNear", "$search", "$searchMeta", "$vectorSearch"];
            pipeline.splice(protectedFirstStages.includes(firstStage) ? 1 : 0, 0, { $match: { isDeleted: { $ne: true } } });
        }
        next();
    });
    ["deleteOne", "deleteMany", "findOneAndDelete"].forEach((operation) => {
        schema.pre(operation, function (next) {
            next(new Error("Physical deletion is disabled for protected records."));
        });
    });
    schema.pre("deleteOne", { document: true, query: false }, function (next) {
        next(new Error("Physical deletion is disabled for protected records."));
    });
    // Full-document replacements can silently remove soft-delete metadata and
    // unrelated fields. Normal edits must use validated update/save operations.
    ["replaceOne", "findOneAndReplace"].forEach((operation) => {
        schema.pre(operation, function (next) {
            next(new Error("Full-document replacement is disabled for protected records."));
        });
    });
    if (options.audit !== false) {
        schema.pre("save", async function () {
            if (this.isNew || this.$locals.skipAudit)
                return;
            this.$locals.auditBefore = await this.constructor.findOne({ _id: this._id }).setOptions({ includeDeleted: true }).lean();
        });
        schema.post("save", async function () {
            if (this.$locals.skipAudit)
                return;
            await (0, auditService_1.recordAuditEvent)({
                entityType: options.entityType,
                entityId: String(this._id),
                action: this.$locals.auditBefore ? "update" : "create",
                before: this.$locals.auditBefore,
                after: snapshot(this),
            });
        });
        schema.pre("findOneAndUpdate", async function () {
            var _a;
            if ((_a = this.getOptions) === null || _a === void 0 ? void 0 : _a.call(this).skipAudit)
                return;
            this._auditBefore = await this.model.findOne(this.getQuery()).setOptions({ includeDeleted: true }).lean();
        });
        schema.post("findOneAndUpdate", async function () {
            var _a, _b;
            if ((_a = this.getOptions) === null || _a === void 0 ? void 0 : _a.call(this).skipAudit)
                return;
            if (!((_b = this._auditBefore) === null || _b === void 0 ? void 0 : _b._id))
                return;
            const after = await this.model.findOne({ _id: this._auditBefore._id }).setOptions({ includeDeleted: true }).lean();
            await (0, auditService_1.recordAuditEvent)({
                entityType: options.entityType,
                entityId: String(this._auditBefore._id),
                action: "update",
                before: this._auditBefore,
                after,
            });
        });
        ["updateOne", "updateMany"].forEach((operation) => {
            schema.pre(operation, async function () {
                var _a;
                if ((_a = this.getOptions) === null || _a === void 0 ? void 0 : _a.call(this).skipAudit)
                    return;
                this._auditBeforeMany = await this.model
                    .find(this.getQuery())
                    .setOptions({ includeDeleted: true })
                    .limit(101)
                    .lean();
            });
            schema.post(operation, async function () {
                var _a;
                if (((_a = this.getOptions) === null || _a === void 0 ? void 0 : _a.call(this).skipAudit) || !Array.isArray(this._auditBeforeMany))
                    return;
                const tracked = this._auditBeforeMany.slice(0, 100);
                for (const before of tracked) {
                    const after = await this.model.findById(before._id).setOptions({ includeDeleted: true }).lean();
                    await (0, auditService_1.recordAuditEvent)({
                        entityType: options.entityType,
                        entityId: String(before._id),
                        action: "update",
                        before,
                        after,
                    });
                }
                if (this._auditBeforeMany.length > 100) {
                    await (0, auditService_1.recordAuditEvent)({
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
exports.softDeletePlugin = softDeletePlugin;

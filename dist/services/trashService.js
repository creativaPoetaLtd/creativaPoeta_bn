"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveSnapshotToTrash = exports.moveDocumentToTrash = exports.snapshotForTrash = exports.trashEntityTypes = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const auditService_1 = require("./auditService");
exports.trashEntityTypes = [
    "admin_user", "blog", "blog_comment", "project_request", "contact_query",
    "partnership_request", "referral_partner", "referral_lead", "job_application",
    "inbound_email", "outbound_email", "job", "referral_reward", "admin_notification",
    "internal_conversation", "whatsapp_conversation", "whatsapp_message",
];
const snapshotForTrash = (document) => {
    if (document && typeof document.toObject === "function") {
        return document.toObject({ depopulate: true, virtuals: false, getters: false, transform: false });
    }
    return { ...document };
};
exports.snapshotForTrash = snapshotForTrash;
const moveDocumentToTrash = async ({ entityType, document, req, reason, session, }) => {
    const performDelete = async (activeSession) => {
        var _a, _b, _c;
        if (document.isDeleted)
            return document;
        const before = (0, exports.snapshotForTrash)(document);
        document.isDeleted = true;
        document.deletedAt = new Date();
        document.deletedById = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) ? String(req.user._id) : undefined;
        document.deletedByEmail = String(((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "").trim().toLowerCase() || undefined;
        document.deletedByName = String(((_c = req.user) === null || _c === void 0 ? void 0 : _c.name) || "").trim() || undefined;
        document.deleteReason = String(reason || "").trim().slice(0, 1000) || undefined;
        document.$locals.skipAudit = true;
        await document.save({ session: activeSession });
        await (0, auditService_1.recordAuditEvent)({
            entityType,
            entityId: String(document._id),
            action: "delete",
            before,
            after: (0, exports.snapshotForTrash)(document),
            required: true,
            session: activeSession,
        });
        return document;
    };
    if (session)
        return performDelete(session);
    const ownedSession = await mongoose_1.default.startSession();
    try {
        let result = document;
        await ownedSession.withTransaction(async () => { result = await performDelete(ownedSession); });
        return result;
    }
    finally {
        await ownedSession.endSession();
    }
};
exports.moveDocumentToTrash = moveDocumentToTrash;
const modelNames = {
    admin_user: "User",
    blog: "Blog",
    project_request: "ProjectDescription",
    contact_query: "Query",
    partnership_request: "PartnershipRequest",
    referral_partner: "ReferralPartner",
    referral_lead: "ReferralLead",
    job_application: "JobApplication",
    job_application_file: "JobApplicationFile",
    inbound_email: "EmailMessage",
    outbound_email: "OutboundEmail",
    job: "Job",
    referral_reward: "ReferralReward",
    admin_notification: "AdminNotification",
    internal_conversation: "InternalConversation",
    whatsapp_conversation: "WhatsAppConversation",
    whatsapp_message: "WhatsAppMessage",
};
// Compatibility adapter for controllers that used to move snapshots into a
// separate trash collection. It now marks the original record in place and
// deliberately never calls deleteOriginal.
const moveSnapshotToTrash = async ({ entityType, originalId, snapshot, relatedSnapshots = [], req, reason, }) => {
    const session = await mongoose_1.default.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            var _a, _b, _c, _d, _e;
            if (entityType === "blog_comment") {
                const Blog = mongoose_1.default.model("Blog");
                const blog = await Blog.findById(snapshot === null || snapshot === void 0 ? void 0 : snapshot.blogId).setOptions({ includeDeleted: true }).session(session);
                const comment = (_a = blog === null || blog === void 0 ? void 0 : blog.comments) === null || _a === void 0 ? void 0 : _a.id(originalId);
                if (!blog || !comment)
                    throw new Error("Comment not found.");
                const before = (0, exports.snapshotForTrash)(comment);
                comment.isDeleted = true;
                comment.deletedAt = new Date();
                comment.deletedById = ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) ? String(req.user._id) : undefined;
                comment.deletedByEmail = (_c = req.user) === null || _c === void 0 ? void 0 : _c.email;
                comment.deletedByName = (_d = req.user) === null || _d === void 0 ? void 0 : _d.name;
                comment.deleteReason = String(reason || "").trim().slice(0, 1000) || undefined;
                blog.$locals.skipAudit = true;
                await blog.save({ session });
                await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "delete", before, after: (0, exports.snapshotForTrash)(comment), required: true, session });
                result = comment;
                return;
            }
            for (const related of relatedSnapshots) {
                const relatedModelName = modelNames[related.entityType];
                if (!relatedModelName || !((_e = related.snapshot) === null || _e === void 0 ? void 0 : _e._id))
                    continue;
                const relatedDocument = await mongoose_1.default.model(relatedModelName).findById(related.snapshot._id)
                    .setOptions({ includeDeleted: true }).session(session);
                if (relatedDocument)
                    await (0, exports.moveDocumentToTrash)({ entityType: related.entityType, document: relatedDocument, req, reason, session });
            }
            const modelName = modelNames[entityType];
            if (!modelName)
                throw new Error("Unsupported record type.");
            const document = await mongoose_1.default.model(modelName).findById(originalId).setOptions({ includeDeleted: true }).session(session);
            if (!document)
                throw new Error("Record not found.");
            result = await (0, exports.moveDocumentToTrash)({ entityType, document, req, reason, session });
        });
        return result;
    }
    finally {
        await session.endSession();
    }
};
exports.moveSnapshotToTrash = moveSnapshotToTrash;

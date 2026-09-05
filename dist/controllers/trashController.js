"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollbackAuditEvent = exports.cleanRollbackValue = exports.listAuditEvents = exports.getAuditHistory = exports.permanentlyDeleteTrashItem = exports.restoreTrashItem = exports.listTrashItems = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const AuditEvent_1 = __importDefault(require("../models/AuditEvent"));
const User_1 = __importDefault(require("../models/User"));
const Blog_1 = __importDefault(require("../models/Blog"));
const ProjectDescription_1 = __importDefault(require("../models/ProjectDescription"));
const Query_1 = __importDefault(require("../models/Query"));
const PartnershipRequest_1 = __importDefault(require("../models/PartnershipRequest"));
const ReferralPartner_1 = __importDefault(require("../models/ReferralPartner"));
const ReferralLead_1 = __importDefault(require("../models/ReferralLead"));
const JobApplication_1 = __importDefault(require("../models/JobApplication"));
const JobApplicationFile_1 = __importDefault(require("../models/JobApplicationFile"));
const EmailMessage_1 = __importDefault(require("../models/EmailMessage"));
const OutboundEmail_1 = __importDefault(require("../models/OutboundEmail"));
const Job_1 = __importDefault(require("../models/Job"));
const ReferralReward_1 = __importDefault(require("../models/ReferralReward"));
const AdminNotification_1 = __importDefault(require("../models/AdminNotification"));
const InternalConversation_1 = __importDefault(require("../models/InternalConversation"));
const WhatsAppConversation_1 = __importDefault(require("../models/WhatsAppConversation"));
const WhatsAppMessage_1 = __importDefault(require("../models/WhatsAppMessage"));
const auditService_1 = require("../services/auditService");
const trashService_1 = require("../services/trashService");
const modelRegistry = {
    admin_user: User_1.default, blog: Blog_1.default, project_request: ProjectDescription_1.default, contact_query: Query_1.default,
    partnership_request: PartnershipRequest_1.default, referral_partner: ReferralPartner_1.default,
    referral_lead: ReferralLead_1.default, job_application: JobApplication_1.default,
    job_application_file: JobApplicationFile_1.default, inbound_email: EmailMessage_1.default, outbound_email: OutboundEmail_1.default,
    job: Job_1.default, referral_reward: ReferralReward_1.default, admin_notification: AdminNotification_1.default,
    internal_conversation: InternalConversation_1.default, whatsapp_conversation: WhatsAppConversation_1.default,
    whatsapp_message: WhatsAppMessage_1.default,
};
const duplicateRestoreMessage = "Restoration is blocked because an active record now uses the same unique information. The deleted item remains safely archived.";
const labelFor = (entityType, item) => {
    var _a, _b;
    const values = {
        admin_user: item.name || item.email,
        blog: item.title || item.slug,
        project_request: item.fullName || item.name || item.email,
        contact_query: item.name || item.email || item.subject,
        partnership_request: item.organization || item.name || item.email,
        referral_partner: item.fullName || item.name || item.email || item.partnerId,
        referral_lead: item.companyName || item.clientName || item.contactName || item.email,
        job_application: item.fullName || item.email || item.jobTitle,
        inbound_email: item.subject || ((_a = item.from) === null || _a === void 0 ? void 0 : _a.address) || item.from,
        outbound_email: item.subject || ((_b = item.to) === null || _b === void 0 ? void 0 : _b[0]) || item.to,
        job: item.title || item.company,
        referral_reward: item.partnerId || item.paymentReference,
        admin_notification: item.title || item.targetEmail,
        internal_conversation: item.title || item.groupKey,
        whatsapp_conversation: item.displayName || item.displayPhoneNumber || item.waId,
        whatsapp_message: item.text || item.providerMessageId,
    };
    return String(values[entityType] || item._id || "Deleted record");
};
const toTrashItem = (entityType, item, id = item._id, label) => ({
    _id: `${entityType}:${String(id)}`, entityType, originalId: String(id),
    label: label || labelFor(entityType, item), deletedByEmail: item.deletedByEmail,
    deletedByName: item.deletedByName, deletedAt: item.deletedAt,
});
const getDeletedRecords = async (entityType) => {
    if (entityType === "blog_comment") {
        const blogs = await Blog_1.default.find({ comments: { $elemMatch: { isDeleted: true } } })
            .setOptions({ includeDeleted: true }).select("title comments").lean();
        return blogs.flatMap((blog) => (blog.comments || []).filter((comment) => comment.isDeleted)
            .map((comment) => toTrashItem("blog_comment", comment, comment._id, `${comment.name || "Blog comment"} - ${blog.title}`)));
    }
    const Model = modelRegistry[entityType];
    if (!Model)
        return [];
    const items = await Model.find({ isDeleted: true }).setOptions({ includeDeleted: true }).lean();
    return items.map((item) => toTrashItem(entityType, item));
};
const listTrashItems = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const requestedType = String(req.query.entityType || "").trim();
        const selectedTypes = requestedType && trashService_1.trashEntityTypes.includes(requestedType) ? [requestedType] : [...trashService_1.trashEntityTypes];
        const search = String(req.query.search || "").trim().toLowerCase().slice(0, 200);
        const allItems = (await Promise.all(selectedTypes.map(getDeletedRecords))).flat()
            .filter((item) => !search || [item.label, item.deletedByEmail, item.deletedByName, item.originalId]
            .some((value) => String(value || "").toLowerCase().includes(search)))
            .sort((a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime());
        const total = allItems.length;
        res.json({ items: allItems.slice((page - 1) * limit, page * limit),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, entityTypes: trashService_1.trashEntityTypes });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to load deleted items.", error: error.message });
    }
};
exports.listTrashItems = listTrashItems;
const parseTarget = (req) => {
    var _a;
    const entityType = String(req.params.entityType || req.query.entityType || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.entityType) || "");
    const originalId = String(req.params.id || "");
    if (!trashService_1.trashEntityTypes.includes(entityType))
        throw new Error("A valid entity type is required.");
    if (!mongoose_1.default.isValidObjectId(originalId))
        throw new Error("A valid record identifier is required.");
    return { entityType, originalId };
};
const restoreBlogComment = async (commentId, session) => {
    const blog = await Blog_1.default.findOne({ comments: { $elemMatch: { _id: commentId, isDeleted: true } } })
        .setOptions({ includeDeleted: true }).session(session);
    if (!blog)
        return null;
    const comment = blog.comments.id(commentId);
    const before = (0, trashService_1.snapshotForTrash)(comment);
    comment.isDeleted = false;
    comment.deletedAt = undefined;
    comment.deletedById = undefined;
    comment.deletedByEmail = undefined;
    comment.deletedByName = undefined;
    comment.deleteReason = undefined;
    blog.$locals.skipAudit = true;
    await blog.save({ session });
    await (0, auditService_1.recordAuditEvent)({ entityType: "blog_comment", entityId: commentId, action: "restore", before, after: (0, trashService_1.snapshotForTrash)(comment), required: true, session });
    return comment;
};
const restoreTrashItem = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    try {
        const { entityType, originalId } = parseTarget(req);
        let found = false;
        await session.withTransaction(async () => {
            if (entityType === "blog_comment") {
                found = Boolean(await restoreBlogComment(originalId, session));
                return;
            }
            const Model = modelRegistry[entityType];
            const document = await (Model === null || Model === void 0 ? void 0 : Model.findOne({ _id: originalId, isDeleted: true }).setOptions({ includeDeleted: true }).session(session));
            if (!document)
                return;
            found = true;
            const before = (0, trashService_1.snapshotForTrash)(document);
            document.isDeleted = false;
            document.deletedAt = undefined;
            document.deletedById = undefined;
            document.deletedByEmail = undefined;
            document.deletedByName = undefined;
            document.deleteReason = undefined;
            document.$locals.skipAudit = true;
            await document.save({ session });
            if (entityType === "job_application") {
                await JobApplicationFile_1.default.updateMany({ application: document._id, isDeleted: true }, { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedById: 1, deletedByEmail: 1, deletedByName: 1, deleteReason: 1 } }, { session }).setOptions({ includeDeleted: true, skipAudit: true });
            }
            await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "restore", before, after: (0, trashService_1.snapshotForTrash)(document), required: true, session });
        });
        if (!found)
            return void res.status(404).json({ message: "Deleted item not found." });
        res.json({ message: "Item restored successfully." });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) === 11000)
            return void res.status(409).json({ message: duplicateRestoreMessage });
        res.status(409).json({ message: (error === null || error === void 0 ? void 0 : error.message) || "Failed to restore deleted item." });
    }
    finally {
        await session.endSession();
    }
};
exports.restoreTrashItem = restoreTrashItem;
let purgeConnection = null;
const getPurgeConnection = async () => {
    const uri = String(process.env.MONGO_PURGE_URI || "").trim();
    if (!uri)
        throw Object.assign(new Error("Permanent deletion is disabled until the isolated purge credential is configured."), { status: 503 });
    if (!purgeConnection) {
        const candidate = await mongoose_1.default.createConnection(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false }).asPromise();
        const runtimeDatabase = mongoose_1.default.connection.name;
        if (!runtimeDatabase || candidate.name !== runtimeDatabase) {
            await candidate.close().catch(() => undefined);
            throw Object.assign(new Error("The purge credential must target the same application database as the runtime connection."), { status: 503 });
        }
        purgeConnection = candidate;
    }
    return purgeConnection;
};
const permanentlyDeleteTrashItem = async (req, res) => {
    try {
        const { entityType, originalId } = parseTarget(req);
        const connection = await getPurgeConnection();
        if (entityType === "blog_comment") {
            const blog = await Blog_1.default.findOne({ comments: { $elemMatch: { _id: originalId, isDeleted: true } } }).setOptions({ includeDeleted: true }).lean();
            if (!blog)
                return void res.status(404).json({ message: "Deleted item not found." });
            await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "purge_request", before: { blogId: String(blog._id) }, required: true });
            const result = await connection.collection(Blog_1.default.collection.name).updateOne({ _id: blog._id }, { $pull: { comments: { _id: new mongoose_1.default.Types.ObjectId(originalId), isDeleted: true } } });
            if (result.modifiedCount !== 1)
                throw new Error("Permanent deletion was not applied. The deleted item remains archived.");
            await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "purge", before: { blogId: String(blog._id) }, required: true });
            return void res.json({ message: "Item permanently deleted." });
        }
        const Model = modelRegistry[entityType];
        const document = await (Model === null || Model === void 0 ? void 0 : Model.findOne({ _id: originalId, isDeleted: true }).setOptions({ includeDeleted: true }).lean());
        if (!Model || !document)
            return void res.status(404).json({ message: "Deleted item not found." });
        await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "purge_request", before: document, required: true });
        if (entityType === "job_application") {
            await connection.collection(JobApplicationFile_1.default.collection.name).deleteMany({ application: document._id, isDeleted: true });
        }
        const result = await connection.collection(Model.collection.name).deleteOne({ _id: document._id, isDeleted: true });
        if (result.deletedCount !== 1)
            throw new Error("Permanent deletion was not applied. The deleted item remains archived.");
        await (0, auditService_1.recordAuditEvent)({ entityType, entityId: originalId, action: "purge", before: document, required: true });
        res.json({ message: "Item permanently deleted." });
    }
    catch (error) {
        res.status((error === null || error === void 0 ? void 0 : error.status) || 500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || "Failed to permanently delete item." });
    }
};
exports.permanentlyDeleteTrashItem = permanentlyDeleteTrashItem;
const getAuditHistory = async (req, res) => {
    const events = await AuditEvent_1.default.find({ entityType: String(req.params.entityType), entityId: String(req.params.id) })
        .select("+before +after").sort({ createdAt: -1 }).limit(100).lean();
    res.json({ events });
};
exports.getAuditHistory = getAuditHistory;
const listAuditEvents = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const entityType = String(req.query.entityType || "").trim().slice(0, 80);
        const action = String(req.query.action || "").trim().slice(0, 20);
        const search = String(req.query.search || "").trim().slice(0, 160);
        const filter = {};
        if (entityType)
            filter.entityType = entityType;
        if (["create", "update", "delete", "restore", "purge_request", "purge", "rollback"].includes(action))
            filter.action = action;
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { entityId: { $regex: escaped, $options: "i" } },
                { actorEmail: { $regex: escaped, $options: "i" } },
                { actorName: { $regex: escaped, $options: "i" } },
            ];
        }
        const [events, total] = await Promise.all([
            AuditEvent_1.default.find(filter).select("+before").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            AuditEvent_1.default.countDocuments(filter),
        ]);
        res.json({
            events: events.map((event) => ({
                _id: event._id,
                entityType: event.entityType,
                entityId: event.entityId,
                action: event.action,
                changedPaths: event.changedPaths,
                actorEmail: event.actorEmail,
                actorName: event.actorName,
                actorRole: event.actorRole,
                requestId: event.requestId,
                createdAt: event.createdAt,
                canRollback: Boolean(event.before)
                    && event.action !== "create"
                    && event.action !== "purge_request"
                    && event.action !== "purge"
                    && event.entityType !== "blog_comment"
                    && Boolean(modelRegistry[event.entityType]),
            })),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to load security history.", error: error.message });
    }
};
exports.listAuditEvents = listAuditEvents;
const blockedRollbackKey = /(password|secret|token|authorization|cookie|signature|html|\bdata\b)/i;
const cleanRollbackValue = (value, depth = 0) => {
    if (depth > 8 || value === undefined)
        return undefined;
    if (typeof value === "string") {
        if (value === "$redacted" || value.startsWith("[binary:") || value.endsWith("..."))
            return undefined;
        return value;
    }
    if (value === null || typeof value === "number" || typeof value === "boolean" || value instanceof Date)
        return value;
    if (Array.isArray(value)) {
        if (value.length >= 250)
            return undefined;
        const result = value.map((entry) => (0, exports.cleanRollbackValue)(entry, depth + 1));
        return result.some((entry) => entry === undefined) ? undefined : result;
    }
    if (typeof value === "object") {
        const result = {};
        for (const [key, entry] of Object.entries(value)) {
            if (blockedRollbackKey.test(key))
                continue;
            const cleaned = (0, exports.cleanRollbackValue)(entry, depth + 1);
            if (cleaned !== undefined)
                result[key] = cleaned;
        }
        return result;
    }
    return undefined;
};
exports.cleanRollbackValue = cleanRollbackValue;
const rollbackAuditEvent = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    try {
        const entityType = String(req.params.entityType || "");
        const entityId = String(req.params.id || "");
        if (!trashService_1.trashEntityTypes.includes(entityType) || entityType === "blog_comment")
            return void res.status(400).json({ message: "Rollback is not supported for this type." });
        const Model = modelRegistry[entityType];
        if (!Model)
            return void res.status(400).json({ message: "Rollback is not supported for this type." });
        let restored;
        let failureStatus = 0;
        let failureMessage = "";
        await session.withTransaction(async () => {
            const event = await AuditEvent_1.default.findOne({ _id: req.params.eventId, entityType, entityId })
                .select("+before +after").session(session).lean();
            if (!(event === null || event === void 0 ? void 0 : event.before)) {
                failureStatus = 409;
                failureMessage = "This event has no restorable previous state.";
                return;
            }
            const current = await Model.findById(entityId)
                .setOptions({ includeDeleted: true }).session(session).lean();
            if (!current) {
                failureStatus = 404;
                failureMessage = "Record not found.";
                return;
            }
            const safeBefore = (0, exports.cleanRollbackValue)(event.before);
            ["_id", "__v", "createdAt", "updatedAt", "isDeleted", "deletedAt", "deletedById", "deletedByEmail", "deletedByName", "deleteReason"].forEach((key) => delete safeBefore[key]);
            if (Object.keys(safeBefore).length === 0) {
                failureStatus = 409;
                failureMessage = "This audit snapshot contains no safely restorable fields.";
                return;
            }
            restored = await Model.findOneAndUpdate({ _id: entityId }, { $set: safeBefore }, { new: true, runValidators: true, includeDeleted: true, skipAudit: true, session });
            await (0, auditService_1.recordAuditEvent)({ entityType, entityId, action: "rollback", before: current, after: restored ? (0, trashService_1.snapshotForTrash)(restored) : undefined, required: true, session });
        });
        if (failureStatus)
            return void res.status(failureStatus).json({ message: failureMessage });
        res.json({ message: "Previous version restored.", item: restored });
    }
    catch (error) {
        res.status((error === null || error === void 0 ? void 0 : error.code) === 11000 ? 409 : 500).json({ message: (error === null || error === void 0 ? void 0 : error.code) === 11000 ? duplicateRestoreMessage : (error === null || error === void 0 ? void 0 : error.message) || "Rollback failed." });
    }
    finally {
        await session.endSession();
    }
};
exports.rollbackAuditEvent = rollbackAuditEvent;

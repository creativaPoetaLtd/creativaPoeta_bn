import { Request, Response } from "express";
import mongoose, { ClientSession, Model } from "mongoose";
import AuditEvent from "../models/AuditEvent";
import User from "../models/User";
import Blog from "../models/Blog";
import ProjectRequest from "../models/ProjectDescription";
import Query from "../models/Query";
import PartnershipRequest from "../models/PartnershipRequest";
import ReferralPartner from "../models/ReferralPartner";
import ReferralLead from "../models/ReferralLead";
import JobApplication from "../models/JobApplication";
import JobApplicationFile from "../models/JobApplicationFile";
import EmailMessage from "../models/EmailMessage";
import OutboundEmail from "../models/OutboundEmail";
import Job from "../models/Job";
import ReferralReward from "../models/ReferralReward";
import AdminNotification from "../models/AdminNotification";
import InternalConversation from "../models/InternalConversation";
import WhatsAppConversation from "../models/WhatsAppConversation";
import WhatsAppMessage from "../models/WhatsAppMessage";
import { recordAuditEvent } from "../services/auditService";
import { snapshotForTrash, TrashEntityType, trashEntityTypes } from "../services/trashService";

const modelRegistry: Partial<Record<TrashEntityType | "job_application_file", Model<any>>> = {
  admin_user: User, blog: Blog, project_request: ProjectRequest, contact_query: Query,
  partnership_request: PartnershipRequest, referral_partner: ReferralPartner,
  referral_lead: ReferralLead, job_application: JobApplication,
  job_application_file: JobApplicationFile, inbound_email: EmailMessage, outbound_email: OutboundEmail,
  job: Job, referral_reward: ReferralReward, admin_notification: AdminNotification,
  internal_conversation: InternalConversation, whatsapp_conversation: WhatsAppConversation,
  whatsapp_message: WhatsAppMessage,
};

const duplicateRestoreMessage = "Restoration is blocked because an active record now uses the same unique information. The deleted item remains safely archived.";

const labelFor = (entityType: TrashEntityType, item: any) => {
  const values: Partial<Record<TrashEntityType, string>> = {
    admin_user: item.name || item.email,
    blog: item.title || item.slug,
    project_request: item.fullName || item.name || item.email,
    contact_query: item.name || item.email || item.subject,
    partnership_request: item.organization || item.name || item.email,
    referral_partner: item.fullName || item.name || item.email || item.partnerId,
    referral_lead: item.companyName || item.clientName || item.contactName || item.email,
    job_application: item.fullName || item.email || item.jobTitle,
    inbound_email: item.subject || item.from?.address || item.from,
    outbound_email: item.subject || item.to?.[0] || item.to,
    job: item.title || item.company,
    referral_reward: item.partnerId || item.paymentReference,
    admin_notification: item.title || item.targetEmail,
    internal_conversation: item.title || item.groupKey,
    whatsapp_conversation: item.displayName || item.displayPhoneNumber || item.waId,
    whatsapp_message: item.text || item.providerMessageId,
  };
  return String(values[entityType] || item._id || "Deleted record");
};

const toTrashItem = (entityType: TrashEntityType, item: any, id = item._id, label?: string) => ({
  _id: `${entityType}:${String(id)}`, entityType, originalId: String(id),
  label: label || labelFor(entityType, item), deletedByEmail: item.deletedByEmail,
  deletedByName: item.deletedByName, deletedAt: item.deletedAt,
});

const getDeletedRecords = async (entityType: TrashEntityType) => {
  if (entityType === "blog_comment") {
    const blogs = await Blog.find({ comments: { $elemMatch: { isDeleted: true } } })
      .setOptions({ includeDeleted: true }).select("title comments").lean();
    return blogs.flatMap((blog: any) => (blog.comments || []).filter((comment: any) => comment.isDeleted)
      .map((comment: any) => toTrashItem("blog_comment", comment, comment._id, `${comment.name || "Blog comment"} - ${blog.title}`)));
  }
  const Model = modelRegistry[entityType];
  if (!Model) return [];
  const items = await Model.find({ isDeleted: true }).setOptions({ includeDeleted: true }).lean();
  return items.map((item: any) => toTrashItem(entityType, item));
};

export const listTrashItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const requestedType = String(req.query.entityType || "").trim() as TrashEntityType;
    const selectedTypes = requestedType && trashEntityTypes.includes(requestedType) ? [requestedType] : [...trashEntityTypes];
    const search = String(req.query.search || "").trim().toLowerCase().slice(0, 200);
    const allItems = (await Promise.all(selectedTypes.map(getDeletedRecords))).flat()
      .filter((item) => !search || [item.label, item.deletedByEmail, item.deletedByName, item.originalId]
        .some((value) => String(value || "").toLowerCase().includes(search)))
      .sort((a, b) => new Date(b.deletedAt || 0).getTime() - new Date(a.deletedAt || 0).getTime());
    const total = allItems.length;
    res.json({ items: allItems.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, entityTypes: trashEntityTypes });
  } catch (error) {
    res.status(500).json({ message: "Failed to load deleted items.", error: (error as Error).message });
  }
};

const parseTarget = (req: Request) => {
  const entityType = String(req.params.entityType || req.query.entityType || req.body?.entityType || "") as TrashEntityType;
  const originalId = String(req.params.id || "");
  if (!trashEntityTypes.includes(entityType)) throw new Error("A valid entity type is required.");
  if (!mongoose.isValidObjectId(originalId)) throw new Error("A valid record identifier is required.");
  return { entityType, originalId };
};

const restoreBlogComment = async (commentId: string, session: ClientSession) => {
  const blog = await Blog.findOne({ comments: { $elemMatch: { _id: commentId, isDeleted: true } } })
    .setOptions({ includeDeleted: true }).session(session);
  if (!blog) return null;
  const comment: any = (blog.comments as any).id(commentId);
  const before = snapshotForTrash(comment);
  comment.isDeleted = false;
  comment.deletedAt = undefined;
  comment.deletedById = undefined;
  comment.deletedByEmail = undefined;
  comment.deletedByName = undefined;
  comment.deleteReason = undefined;
  blog.$locals.skipAudit = true;
  await blog.save({ session });
  await recordAuditEvent({ entityType: "blog_comment", entityId: commentId, action: "restore", before, after: snapshotForTrash(comment), required: true, session });
  return comment;
};

export const restoreTrashItem = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    const { entityType, originalId } = parseTarget(req);
    let found = false;
    await session.withTransaction(async () => {
      if (entityType === "blog_comment") {
        found = Boolean(await restoreBlogComment(originalId, session));
        return;
      }
      const Model = modelRegistry[entityType];
      const document: any = await Model?.findOne({ _id: originalId, isDeleted: true })
        .setOptions({ includeDeleted: true }).session(session);
      if (!document) return;
      found = true;
      const before = snapshotForTrash(document);
      document.isDeleted = false;
      document.deletedAt = undefined;
      document.deletedById = undefined;
      document.deletedByEmail = undefined;
      document.deletedByName = undefined;
      document.deleteReason = undefined;
      document.$locals.skipAudit = true;
      await document.save({ session });
      if (entityType === "job_application") {
        await JobApplicationFile.updateMany(
          { application: document._id, isDeleted: true },
          { $set: { isDeleted: false }, $unset: { deletedAt: 1, deletedById: 1, deletedByEmail: 1, deletedByName: 1, deleteReason: 1 } },
          { session }
        ).setOptions({ includeDeleted: true, skipAudit: true });
      }
      await recordAuditEvent({ entityType, entityId: originalId, action: "restore", before, after: snapshotForTrash(document), required: true, session });
    });
    if (!found) return void res.status(404).json({ message: "Deleted item not found." });
    res.json({ message: "Item restored successfully." });
  } catch (error: any) {
    if (error?.code === 11000) return void res.status(409).json({ message: duplicateRestoreMessage });
    res.status(409).json({ message: error?.message || "Failed to restore deleted item." });
  } finally {
    await session.endSession();
  }
};

let purgeConnection: mongoose.Connection | null = null;
const getPurgeConnection = async () => {
  const uri = String(process.env.MONGO_PURGE_URI || "").trim();
  if (!uri) throw Object.assign(new Error("Permanent deletion is disabled until the isolated purge credential is configured."), { status: 503 });
  if (!purgeConnection) {
    const candidate = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 10000, autoIndex: false }).asPromise();
    const runtimeDatabase = mongoose.connection.name;
    if (!runtimeDatabase || candidate.name !== runtimeDatabase) {
      await candidate.close().catch(() => undefined);
      throw Object.assign(new Error("The purge credential must target the same application database as the runtime connection."), { status: 503 });
    }
    purgeConnection = candidate;
  }
  return purgeConnection;
};

export const permanentlyDeleteTrashItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { entityType, originalId } = parseTarget(req);
    const connection = await getPurgeConnection();
    if (entityType === "blog_comment") {
      const blog = await Blog.findOne({ comments: { $elemMatch: { _id: originalId, isDeleted: true } } }).setOptions({ includeDeleted: true }).lean();
      if (!blog) return void res.status(404).json({ message: "Deleted item not found." });
      await recordAuditEvent({ entityType, entityId: originalId, action: "purge_request", before: { blogId: String(blog._id) }, required: true });
      const result = await connection.collection(Blog.collection.name).updateOne(
        { _id: blog._id },
        { $pull: { comments: { _id: new mongoose.Types.ObjectId(originalId), isDeleted: true } } } as any
      );
      if (result.modifiedCount !== 1) throw new Error("Permanent deletion was not applied. The deleted item remains archived.");
      await recordAuditEvent({ entityType, entityId: originalId, action: "purge", before: { blogId: String(blog._id) }, required: true });
      return void res.json({ message: "Item permanently deleted." });
    }
    const Model = modelRegistry[entityType];
    const document: any = await Model?.findOne({ _id: originalId, isDeleted: true }).setOptions({ includeDeleted: true }).lean();
    if (!Model || !document) return void res.status(404).json({ message: "Deleted item not found." });
    await recordAuditEvent({ entityType, entityId: originalId, action: "purge_request", before: document, required: true });
    if (entityType === "job_application") {
      await connection.collection(JobApplicationFile.collection.name).deleteMany({ application: document._id, isDeleted: true });
    }
    const result = await connection.collection(Model.collection.name).deleteOne({ _id: document._id, isDeleted: true });
    if (result.deletedCount !== 1) throw new Error("Permanent deletion was not applied. The deleted item remains archived.");
    await recordAuditEvent({ entityType, entityId: originalId, action: "purge", before: document, required: true });
    res.json({ message: "Item permanently deleted." });
  } catch (error: any) {
    res.status(error?.status || 500).json({ message: error?.message || "Failed to permanently delete item." });
  }
};

export const getAuditHistory = async (req: Request, res: Response): Promise<void> => {
  const events = await AuditEvent.find({ entityType: String(req.params.entityType), entityId: String(req.params.id) })
    .select("+before +after").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ events });
};

export const listAuditEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const entityType = String(req.query.entityType || "").trim().slice(0, 80);
    const action = String(req.query.action || "").trim().slice(0, 20);
    const search = String(req.query.search || "").trim().slice(0, 160);
    const filter: Record<string, unknown> = {};
    if (entityType) filter.entityType = entityType;
    if (["create", "update", "delete", "restore", "purge_request", "purge", "rollback"].includes(action)) filter.action = action;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { entityId: { $regex: escaped, $options: "i" } },
        { actorEmail: { $regex: escaped, $options: "i" } },
        { actorName: { $regex: escaped, $options: "i" } },
      ];
    }
    const [events, total] = await Promise.all([
      AuditEvent.find(filter).select("+before").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditEvent.countDocuments(filter),
    ]);
    res.json({
      events: events.map((event: any) => ({
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
          && Boolean(modelRegistry[event.entityType as TrashEntityType]),
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load security history.", error: (error as Error).message });
  }
};

const blockedRollbackKey = /(password|secret|token|authorization|cookie|signature|html|\bdata\b)/i;
export const cleanRollbackValue = (value: unknown, depth = 0): unknown => {
  if (depth > 8 || value === undefined) return undefined;
  if (typeof value === "string") {
    if (value === "$redacted" || value.startsWith("[binary:") || value.endsWith("...")) return undefined;
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  if (Array.isArray(value)) {
    if (value.length >= 250) return undefined;
    const result = value.map((entry) => cleanRollbackValue(entry, depth + 1));
    return result.some((entry) => entry === undefined) ? undefined : result;
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (blockedRollbackKey.test(key)) continue;
      const cleaned = cleanRollbackValue(entry, depth + 1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  return undefined;
};

export const rollbackAuditEvent = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    const entityType = String(req.params.entityType || "") as TrashEntityType;
    const entityId = String(req.params.id || "");
    if (!trashEntityTypes.includes(entityType) || entityType === "blog_comment") return void res.status(400).json({ message: "Rollback is not supported for this type." });
    const Model = modelRegistry[entityType];
    if (!Model) return void res.status(400).json({ message: "Rollback is not supported for this type." });
    let restored: any;
    let failureStatus = 0;
    let failureMessage = "";
    await session.withTransaction(async () => {
      const event: any = await AuditEvent.findOne({ _id: req.params.eventId, entityType, entityId })
        .select("+before +after").session(session).lean();
      if (!event?.before) {
        failureStatus = 409;
        failureMessage = "This event has no restorable previous state.";
        return;
      }
      const current: any = await Model.findById(entityId)
        .setOptions({ includeDeleted: true }).session(session).lean();
      if (!current) {
        failureStatus = 404;
        failureMessage = "Record not found.";
        return;
      }
      const safeBefore = cleanRollbackValue(event.before) as Record<string, unknown>;
      ["_id", "__v", "createdAt", "updatedAt", "isDeleted", "deletedAt", "deletedById", "deletedByEmail", "deletedByName", "deleteReason"].forEach((key) => delete safeBefore[key]);
      if (Object.keys(safeBefore).length === 0) {
        failureStatus = 409;
        failureMessage = "This audit snapshot contains no safely restorable fields.";
        return;
      }
      restored = await Model.findOneAndUpdate(
        { _id: entityId },
        { $set: safeBefore },
        { new: true, runValidators: true, includeDeleted: true, skipAudit: true, session }
      );
      await recordAuditEvent({ entityType, entityId, action: "rollback", before: current, after: restored ? snapshotForTrash(restored) : undefined, required: true, session });
    });
    if (failureStatus) return void res.status(failureStatus).json({ message: failureMessage });
    res.json({ message: "Previous version restored.", item: restored });
  } catch (error: any) {
    res.status(error?.code === 11000 ? 409 : 500).json({ message: error?.code === 11000 ? duplicateRestoreMessage : error?.message || "Rollback failed." });
  } finally {
    await session.endSession();
  }
};

import { Request } from "express";
import mongoose, { ClientSession, Document } from "mongoose";
import { recordAuditEvent } from "./auditService";

export const trashEntityTypes = [
  "admin_user", "blog", "blog_comment", "project_request", "contact_query",
  "partnership_request", "referral_partner", "referral_lead", "job_application",
  "inbound_email", "outbound_email", "job", "referral_reward", "admin_notification",
  "internal_conversation", "whatsapp_conversation", "whatsapp_message",
] as const;

export type TrashEntityType = (typeof trashEntityTypes)[number];

export const snapshotForTrash = (document: Document | Record<string, unknown>) => {
  if (document && typeof (document as Document).toObject === "function") {
    return (document as Document).toObject({ depopulate: true, virtuals: false, getters: false, transform: false }) as Record<string, unknown>;
  }
  return { ...(document as Record<string, unknown>) };
};

export const moveDocumentToTrash = async ({
  entityType,
  document,
  req,
  reason,
  session,
}: {
  entityType: TrashEntityType | "job_application_file";
  document: Document & Record<string, any>;
  label?: string;
  req: Request;
  reason?: string;
  relatedSnapshots?: unknown[];
  session?: ClientSession;
}) => {
  const performDelete = async (activeSession: ClientSession) => {
    if (document.isDeleted) return document;
    const before = snapshotForTrash(document);
    document.isDeleted = true;
    document.deletedAt = new Date();
    document.deletedById = req.user?._id ? String(req.user._id) : undefined;
    document.deletedByEmail = String(req.user?.email || "").trim().toLowerCase() || undefined;
    document.deletedByName = String(req.user?.name || "").trim() || undefined;
    document.deleteReason = String(reason || "").trim().slice(0, 1000) || undefined;
    document.$locals.skipAudit = true;
    await document.save({ session: activeSession });
    await recordAuditEvent({
      entityType,
      entityId: String(document._id),
      action: "delete",
      before,
      after: snapshotForTrash(document),
      required: true,
      session: activeSession,
    });
    return document;
  };

  if (session) return performDelete(session);
  const ownedSession = await mongoose.startSession();
  try {
    let result = document;
    await ownedSession.withTransaction(async () => { result = await performDelete(ownedSession); });
    return result;
  } finally {
    await ownedSession.endSession();
  }
};

const modelNames: Partial<Record<TrashEntityType | "job_application_file", string>> = {
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
export const moveSnapshotToTrash = async ({
  entityType,
  originalId,
  snapshot,
  relatedSnapshots = [],
  req,
  reason,
}: {
  entityType: TrashEntityType;
  originalId: string;
  label?: string;
  snapshot?: Record<string, any>;
  relatedSnapshots?: Array<{ entityType: string; snapshot: Record<string, any> }>;
  req: Request;
  reason?: string;
}) => {
  const session = await mongoose.startSession();
  try {
    let result: any;
    await session.withTransaction(async () => {
      if (entityType === "blog_comment") {
        const Blog = mongoose.model("Blog");
        const blog: any = await Blog.findById(snapshot?.blogId).setOptions({ includeDeleted: true }).session(session);
        const comment: any = blog?.comments?.id(originalId);
        if (!blog || !comment) throw new Error("Comment not found.");
        const before = snapshotForTrash(comment);
        comment.isDeleted = true;
        comment.deletedAt = new Date();
        comment.deletedById = req.user?._id ? String(req.user._id) : undefined;
        comment.deletedByEmail = req.user?.email;
        comment.deletedByName = req.user?.name;
        comment.deleteReason = String(reason || "").trim().slice(0, 1000) || undefined;
        blog.$locals.skipAudit = true;
        await blog.save({ session });
        await recordAuditEvent({ entityType, entityId: originalId, action: "delete", before, after: snapshotForTrash(comment), required: true, session });
        result = comment;
        return;
      }

      for (const related of relatedSnapshots) {
        const relatedModelName = modelNames[related.entityType as keyof typeof modelNames];
        if (!relatedModelName || !related.snapshot?._id) continue;
        const relatedDocument: any = await mongoose.model(relatedModelName).findById(related.snapshot._id)
          .setOptions({ includeDeleted: true }).session(session);
        if (relatedDocument) await moveDocumentToTrash({ entityType: related.entityType as "job_application_file", document: relatedDocument, req, reason, session });
      }

      const modelName = modelNames[entityType];
      if (!modelName) throw new Error("Unsupported record type.");
      const document: any = await mongoose.model(modelName).findById(originalId).setOptions({ includeDeleted: true }).session(session);
      if (!document) throw new Error("Record not found.");
      result = await moveDocumentToTrash({ entityType, document, req, reason, session });
    });
    return result;
  } finally {
    await session.endSession();
  }
};

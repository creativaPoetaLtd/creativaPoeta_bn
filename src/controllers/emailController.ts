import { Request, Response } from "express";
import EmailMessage from "../models/EmailMessage";
import OutboundEmail from "../models/OutboundEmail";
import User from "../models/User";
import { getEffectiveAdminRole } from "../middleware/authMiddleware";
import { syncConfiguredMailboxes } from "../services/emailSyncService";
import sendEmail from "../utils/sendEmail";
import { escapeHtml, formatParagraphs, renderQuotedEmailBlock } from "../utils/emailTemplate";

const allowedStatuses = ["new", "read", "replied", "archived"];
const MAX_ATTACHMENT_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 8;

const normalizeReplySubject = (subject: string) =>
  /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || "Your message"}`;


const normalizeForwardSubject = (subject: string) =>
  /^(fw|fwd):/i.test(subject.trim()) ? subject.trim() : `Fwd: ${subject.trim() || "Forwarded message"}`;

const parseQueryValues = (value: unknown): string[] =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();

const parseEmailList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  }

  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

const getAdminName = (req: Request) =>
  (req.user as any)?.name || (req.user as any)?.email || "Admin";
const getAdminEmail = (req: Request) => String((req.user as any)?.email || "").toLowerCase().trim();
const isCpMailbox = (email = "") => /^[-a-z0-9._%+]+@creativapoeta\.(com|be)$/i.test(email.trim());
const SHARED_MAILBOXES = ["contact@creativapoeta.com", "contact@creativapoeta.be"];

const enrichEmailOwnerRoles = async (emails: any[]) => {
  const rows = emails.map((email) =>
    typeof email?.toObject === "function" ? email.toObject() : { ...email }
  );
  const ownerEmails = Array.from(
    new Set(rows.map((email) => normalizeEmail(email.assignedToEmail)).filter(Boolean))
  );

  if (!ownerEmails.length) return rows;

  const owners = await User.find({ email: { $in: ownerEmails } }).select("email role").lean();
  const roleByEmail = new Map(
    owners.map((owner: any) => [normalizeEmail(owner.email), owner.role])
  );

  return rows.map((email) => ({
    ...email,
    assignedToRole: roleByEmail.get(normalizeEmail(email.assignedToEmail)),
  }));
};

const enrichEmailOwnerRole = async (email: any) => (await enrichEmailOwnerRoles([email]))[0];

const canManageSharedMailboxes = (req: Request) =>
  ["super_admin", "admin_0"].includes(getEffectiveAdminRole((req.user as any)?.role, (req.user as any)?.email));

const getAllowedMailboxAddresses = async (req: Request) => {
  const currentEmail = getAdminEmail(req);
  const currentUserId = (req.user as any)?._id || (req.user as any)?.id;
  const user = currentUserId
    ? await User.findById(currentUserId).select("email mailboxAccess role isActive accountStatus")
    : await User.findOne({ email: currentEmail }).select("email mailboxAccess role isActive accountStatus");
  const personalMailboxRows = await User.find({}).select("email").lean();
  const reservedPersonalMailboxes = new Set(
    personalMailboxRows
      .map((row) => normalizeEmail(row.email))
      .filter((address) => address && address !== currentEmail)
  );
  const addresses = new Set<string>();

  if (currentEmail) addresses.add(currentEmail);
  if (user?.email) addresses.add(String(user.email).toLowerCase().trim());

  (user?.mailboxAccess || []).forEach((mailbox) => {
    const address = String(mailbox.address || "").toLowerCase().trim();
    if (!address) return;
    if (mailbox.type === "personal" && address !== currentEmail) return;
    if (reservedPersonalMailboxes.has(address)) return;
    addresses.add(address);
  });

  if (canManageSharedMailboxes(req)) {
    SHARED_MAILBOXES.forEach((address) => addresses.add(address));
    const sharedRows = await User.find({ "mailboxAccess.type": "shared" })
      .select("mailboxAccess")
      .lean();
    sharedRows.forEach((row) => {
      (row.mailboxAccess || []).forEach((mailbox: any) => {
        if (mailbox.type === "shared" && mailbox.address) {
          const address = String(mailbox.address).toLowerCase().trim();
          if (!reservedPersonalMailboxes.has(address)) addresses.add(address);
        }
      });
    });
  }

  return Array.from(addresses).filter(Boolean);
};

const applyInboundMailboxAccess = async (req: Request, filter: any) => {
  const allowedAddresses = await getAllowedMailboxAddresses(req);
  filter.$and = [
    ...(filter.$and || []),
    {
      $or: [{ mailboxAddress: { $in: allowedAddresses } }, { mailbox: { $in: allowedAddresses } }],
    },
  ];
};

const applyOutboundOwnerAccess = (req: Request, filter: any) => {
  filter.createdByEmail = getAdminEmail(req);
};

const addEmailActivity = (email: any, req: Request, type: "assigned" | "released" | "read" | "replied" | "status", message?: string) => {
  email.activity = email.activity || [];
  email.activity.push({
    type,
    actorName: getAdminName(req),
    actorEmail: getAdminEmail(req),
    message,
    createdAt: new Date(),
  });
};

const assignEmailToCurrentUser = (email: any, req: Request, message = "Ticket pris en charge") => {
  email.assignedToEmail = getAdminEmail(req);
  email.assignedToName = getAdminName(req);
  email.assignedAt = new Date();
  addEmailActivity(email, req, "assigned", message);
};

const canModifyEmailAssignment = (req: Request, email: any) =>
  canManageSharedMailboxes(req) || !email.assignedToEmail || email.assignedToEmail === getAdminEmail(req);
const getAdminNotificationEmail = () =>
  process.env.ADMIN_NOTIFICATION_EMAIL ||
  process.env.ADMIN_EMAIL ||
  process.env.EMAIL_USER ||
  "creativapoeta@gmail.com";

const isValidCronToken = (req: Request) => {
  const expected = process.env.EMAIL_SYNC_CRON_TOKEN;
  if (!expected) return false;

  const authorization = String(req.headers.authorization || "");
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const headerToken = String(req.headers["x-cron-token"] || "");
  const queryToken = String(req.query.token || "");

  return [bearerToken, headerToken, queryToken].some((token) => token && token === expected);
};

const notifyAdminAboutNewEmails = async (syncStartedAt: Date, importedCount: number) => {
  if (importedCount <= 0) return;

  const newEmails = await EmailMessage.find({ createdAt: { $gte: syncStartedAt } })
    .sort({ receivedAt: -1 })
    .limit(8);

  const rows = newEmails
    .map((email) => {
      const sender = email.fromName
        ? `${escapeHtml(email.fromName)} &lt;${escapeHtml(email.fromEmail || "")}&gt;`
        : escapeHtml(email.fromEmail || "Expediteur inconnu");

      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5edf7;">
            <strong>${escapeHtml(email.subject || "(Sans sujet)")}</strong><br />
            <span style="color:#64748b;font-size:13px;">${sender}</span><br />
            <span style="color:#64748b;font-size:13px;">Boite: ${escapeHtml(email.mailboxAddress || email.mailbox)}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  const adminUrl =
    process.env.ADMIN_EMAILS_URL ||
    process.env.FRONTEND_ADMIN_EMAILS_URL ||
    "https://creativapoeta.com/secure-admin-dashboard-2024/emails";

  const content = `
    <p>Un ou plusieurs nouveaux emails viennent d'etre importes dans CP Mail.</p>
    <p><strong>${importedCount}</strong> nouveau(x) message(s) detecte(s).</p>
    ${
      rows
        ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;">${rows}</table>`
        : ""
    }
    <p>
      <a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#f2b705;color:#071a33;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:999px;">
        Ouvrir CP Mail
      </a>
    </p>
  `;

  await sendEmail(getAdminNotificationEmail(), "Nouveau mail recu dans CP Mail", content, {
    title: "Nouveau mail recu dans CP Mail",
    preheader: `${importedCount} nouveau(x) message(s) dans Creativa Poeta Mail.`,
    replyTo: process.env.REPLY_TO_EMAIL || process.env.SMTP_FROM_EMAIL || "contact@creativapoeta.com",
  });
};

const getOutboundPayload = (req: Request) => ({
  to: parseEmailList(req.body?.to),
  cc: parseEmailList(req.body?.cc),
  bcc: parseEmailList(req.body?.bcc),
  subject: String(req.body?.subject || "").trim(),
  body: String(req.body?.body || "").trim(),
  signature: String(req.body?.signature || "").trim(),
  fromEmail: normalizeEmail(req.body?.fromEmail || req.body?.from || ""),
});
const getUploadedFiles = (req: Request): Express.Multer.File[] =>
  Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];

const getUploadedAttachments = (req: Request) => {
  const files = getUploadedFiles(req);

  if (files.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`Maximum ${MAX_ATTACHMENT_COUNT} attachments are allowed.`);
  }

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("Attachments are too large. Maximum total size is 8 MB.");
  }

  return {
    mailAttachments: files.map((file) => ({
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype,
    })),
    metadata: files.map((file) => ({
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    })),
  };
};
const sendOutboundPayload = async (
  payload: ReturnType<typeof getOutboundPayload>,
  req: Request
) => {
  if (!payload.to.length) throw new Error("At least one recipient is required.");
  if (!payload.subject) throw new Error("Subject is required.");
  if (!payload.body) throw new Error("Message body is required.");

  const { mailAttachments, metadata } = getUploadedAttachments(req);
  if (payload.fromEmail && !isCpMailbox(payload.fromEmail)) {
    throw new Error("Sender must be a Creativa Poeta mailbox.");
  }

  const allowedSenders = await getAllowedMailboxAddresses(req);
  if (payload.fromEmail && allowedSenders && !allowedSenders.includes(payload.fromEmail)) {
    throw new Error("You cannot send from this mailbox.");
  }

  await sendEmail(payload.to, payload.subject, formatParagraphs(payload.body), {
    cc: payload.cc,
    bcc: payload.bcc,
    fromEmail: payload.fromEmail || undefined,
    title: payload.subject,
    preheader: payload.body.slice(0, 130),
    signature: payload.signature,
    attachments: mailAttachments,
  });

  return {
    ...payload,
    folder: "sent" as const,
    status: "sent" as const,
    fromEmail: payload.fromEmail || undefined,
    attachments: metadata,
    sentAt: new Date(),
    updatedBy: getAdminName(req),
  };
};

export const syncEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.body?.limit || req.query.limit || 50);
    const result = await syncConfiguredMailboxes(limit);
    res.status(200).json({
      message: "Email sync completed",
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to sync emails",
      error: error?.message || "Unknown error",
    });
  }
};
export const cronSyncEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!process.env.EMAIL_SYNC_CRON_TOKEN) {
      res.status(503).json({
        message: "Email cron sync is disabled. Configure EMAIL_SYNC_CRON_TOKEN first.",
      });
      return;
    }

    if (!isValidCronToken(req)) {
      res.status(401).json({ message: "Invalid cron token" });
      return;
    }

    const limit = Number(req.body?.limit || req.query.limit || 50);
    const syncStartedAt = new Date();
    const result = await syncConfiguredMailboxes(limit);

    try {
      await notifyAdminAboutNewEmails(syncStartedAt, result.imported);
    } catch (notificationError) {
      console.error("Email sync notification failed:", notificationError);
    }

    res.status(200).json({
      message: "Email cron sync completed",
      ...result,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to run email cron sync",
      error: error?.message || "Unknown error",
    });
  }
};

export const getEmailSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = {};
    await applyInboundMailboxAccess(req, filter);

    const currentEmail = getAdminEmail(req);
    const [statusCounts, assignedToMe, openAssignedToOthers] = await Promise.all([
      EmailMessage.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      currentEmail ? EmailMessage.countDocuments({ ...filter, assignedToEmail: currentEmail, status: { $ne: "archived" } }) : 0,
      EmailMessage.countDocuments({
        ...filter,
        assignedToEmail: { $exists: true, $nin: [currentEmail, ""] },
        status: { $in: ["new", "read", "replied"] },
      }),
    ]);

    const metrics = statusCounts.reduce((acc: Record<string, number>, item: { _id: string; count: number }) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.status(200).json({
      message: "Email summary fetched successfully",
      metrics: {
        ...metrics,
        assignedToMe,
        openAssignedToOthers,
        attention: (metrics.new || 0) + assignedToMe,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch email summary",
      error: error?.message || "Unknown error",
    });
  }
};
export const getEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
    const status = String(req.query.status || "all");
    const mailbox = String(req.query.mailbox || "all");
    const search = String(req.query.search || "").trim();
    const filter: any = {};

    const selectedStatuses = parseQueryValues(status).filter((item) => allowedStatuses.includes(item));
    const selectedMailboxes = parseQueryValues(mailbox).filter((item) => item && item !== "all");

    if (selectedStatuses.length) filter.status = { $in: selectedStatuses };
    if (selectedMailboxes.length) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { mailbox: { $in: selectedMailboxes } },
            { mailboxAddress: { $in: selectedMailboxes } },
          ],
        },
      ];
    }
    await applyInboundMailboxAccess(req, filter);

    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { preview: { $regex: search, $options: "i" } },
        { text: { $regex: search, $options: "i" } },
        { fromName: { $regex: search, $options: "i" } },
        { fromEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const mailboxAccessFilter: any = {};
    await applyInboundMailboxAccess(req, mailboxAccessFilter);
    const [emails, totalEmails, counts, mailboxRows] = await Promise.all([
      EmailMessage.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit).lean(),
      EmailMessage.countDocuments(filter),
      EmailMessage.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      EmailMessage.aggregate([
        { $match: mailboxAccessFilter },
        { $group: { _id: "$mailboxAddress" } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const syncedMailboxes = mailboxRows.map((row: { _id?: string }) => row._id).filter(Boolean);
    const allowedMailboxAddresses = await getAllowedMailboxAddresses(req);
    const mailboxOptions = allowedMailboxAddresses
      ? Array.from(new Set([...allowedMailboxAddresses, ...syncedMailboxes])).sort()
      : syncedMailboxes;

    const emailsWithOwnerRoles = await enrichEmailOwnerRoles(emails);

    res.status(200).json({
      message: "Emails fetched successfully",
      emails: emailsWithOwnerRoles,
      mailboxes: mailboxOptions,
      metrics: counts.reduce(
        (acc: Record<string, number>, item: { _id: string; count: number }) => {
          acc[item._id] = item.count;
          return acc;
        },
        {}
      ),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEmails / limit) || 1,
        totalEmails,
        limit,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch emails",
      error: error?.message || "Unknown error",
    });
  }
};

export const getOutboundEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
    const folder = req.query.folder === "sent" ? "sent" : "draft";
    const search = String(req.query.search || "").trim();
    const filter: any = { folder };
    applyOutboundOwnerAccess(req, filter);

    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } },
        { to: { $regex: search, $options: "i" } },
        { cc: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [emails, totalEmails, counts] = await Promise.all([
      OutboundEmail.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      OutboundEmail.countDocuments(filter),
      OutboundEmail.aggregate([{ $match: filter }, { $group: { _id: "$folder", count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      message: "Outbound emails fetched successfully",
      emails,
      metrics: counts.reduce(
        (acc: Record<string, number>, item: { _id: string; count: number }) => {
          acc[item._id] = item.count;
          return acc;
        },
        {}
      ),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalEmails / limit) || 1,
        totalEmails,
        limit,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch outbound emails",
      error: error?.message || "Unknown error",
    });
  }
};

export const getEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, filter);
    const email = await EmailMessage.findOne(filter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (email.status === "new") {
      email.status = "read";
      addEmailActivity(email, req, "read", "Message ouvert");
      await email.save();
    }

    res.status(200).json({ message: "Email fetched successfully", email: await enrichEmailOwnerRole(email) });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch email",
      error: error?.message || "Unknown error",
    });
  }
};

export const claimEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, filter);
    const email = await EmailMessage.findOne(filter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (!canModifyEmailAssignment(req, email)) {
      res.status(409).json({
        message: "This email is already assigned to another admin.",
        assignedToName: email.assignedToName,
        assignedToEmail: email.assignedToEmail,
      });
      return;
    }

    assignEmailToCurrentUser(email, req);
    await email.save();

    res.status(200).json({ message: "Email assigned", email: await enrichEmailOwnerRole(email) });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to assign email",
      error: error?.message || "Unknown error",
    });
  }
};

export const releaseEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, filter);
    const email = await EmailMessage.findOne(filter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (!canModifyEmailAssignment(req, email)) {
      res.status(409).json({
        message: "Only the assigned admin can release this email.",
        assignedToName: email.assignedToName,
        assignedToEmail: email.assignedToEmail,
      });
      return;
    }

    const previousOwner = email.assignedToName || email.assignedToEmail || "admin";
    email.assignedToEmail = undefined;
    email.assignedToName = undefined;
    email.assignedAt = undefined;
    addEmailActivity(email, req, "released", `Ticket libere de ${previousOwner}`);
    await email.save();

    res.status(200).json({ message: "Email released", email: await enrichEmailOwnerRole(email) });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to release email",
      error: error?.message || "Unknown error",
    });
  }
};

export const saveDraftEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = getOutboundPayload(req);
    const email = await OutboundEmail.create({
      ...payload,
      folder: "draft",
      status: "draft",
      createdBy: getAdminName(req),
      updatedBy: getAdminName(req),
      createdByEmail: getAdminEmail(req),
      updatedByEmail: getAdminEmail(req),
    });

    res.status(201).json({ message: "Draft saved", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to save draft",
      error: error?.message || "Unknown error",
    });
  }
};

export const updateDraftEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = getOutboundPayload(req);
    const draftFilter: any = { _id: req.params.id, folder: "draft" };
    applyOutboundOwnerAccess(req, draftFilter);
    const email = await OutboundEmail.findOneAndUpdate(
      draftFilter,
      { ...payload, updatedBy: getAdminName(req), updatedByEmail: getAdminEmail(req) },
      { new: true }
    );

    if (!email) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    res.status(200).json({ message: "Draft updated", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to update draft",
      error: error?.message || "Unknown error",
    });
  }
};

export const sendComposedEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = getOutboundPayload(req);
    const sentPayload = await sendOutboundPayload(payload, req);
    const draftId = String(req.body?.draftId || "").trim();

    const email = draftId
      ? await OutboundEmail.findOneAndUpdate({ _id: draftId, createdByEmail: getAdminEmail(req) }, sentPayload, { new: true })
      : await OutboundEmail.create({ ...sentPayload, createdBy: getAdminName(req), createdByEmail: getAdminEmail(req) });

    res.status(200).json({ message: "Email sent", email });
  } catch (error: any) {
    res.status(400).json({
      message: "Failed to send email",
      error: error?.message || "Unknown error",
    });
  }
};

export const sendDraftEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const draftFilter: any = { _id: req.params.id, folder: "draft" };
    applyOutboundOwnerAccess(req, draftFilter);
    const draft = await OutboundEmail.findOne(draftFilter);

    if (!draft) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    try {
      const sentPayload = await sendOutboundPayload(
        {
          to: draft.to || [],
          cc: draft.cc || [],
          bcc: draft.bcc || [],
          subject: draft.subject || "",
          body: draft.body || "",
          signature: draft.signature || "",
          fromEmail: draft.fromEmail || "",
        },
        req
      );

      Object.assign(draft, sentPayload);
      await draft.save();
      res.status(200).json({ message: "Draft sent", email: draft });
    } catch (sendError: any) {
      draft.status = "failed";
      draft.error = sendError?.message || "Unknown error";
      draft.updatedBy = getAdminName(req);
      draft.updatedByEmail = getAdminEmail(req);
      await draft.save();
      res.status(400).json({
        message: "Failed to send draft",
        error: draft.error,
        email: draft,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to send draft",
      error: error?.message || "Unknown error",
    });
  }
};

export const deleteOutboundEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const outboundDeleteFilter: any = { _id: req.params.id };
    applyOutboundOwnerAccess(req, outboundDeleteFilter);
    const email = await OutboundEmail.findOneAndDelete(outboundDeleteFilter);

    if (!email) {
      res.status(404).json({ message: "Outbound email not found" });
      return;
    }

    res.status(200).json({ message: "Email deleted" });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to delete outbound email",
      error: error?.message || "Unknown error",
    });
  }
};

export const replyToEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { replyMessage, subject, signature } = req.body;

    if (!replyMessage || !String(replyMessage).trim()) {
      res.status(400).json({ message: "Reply message is required" });
      return;
    }

    const filter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, filter);
    const email = await EmailMessage.findOne(filter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (!email.fromEmail) {
      res.status(400).json({ message: "This email has no sender address." });
      return;
    }

    const replySubject = normalizeReplySubject(subject || email.subject);
    const cleanMessage = String(replyMessage).trim();
    const content = `
      ${formatParagraphs(cleanMessage)}
      ${renderQuotedEmailBlock({
        mode: "reply",
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        to: email.to || [],
        cc: email.cc || [],
        subject: email.subject,
        sentAt: email.receivedAt,
        html: email.html,
        text: email.text || email.preview || "",
      })}
    `;

    const replyFromEmail = isCpMailbox(email.mailboxAddress || "") ? email.mailboxAddress : undefined;

    await sendEmail(email.fromEmail, replySubject, content, {
      fromEmail: replyFromEmail,
      title: replySubject,
      preheader: cleanMessage.slice(0, 130),
      signature: String(signature || "").trim(),
    });

    if (!email.assignedToEmail) {
      assignEmailToCurrentUser(email, req, "Ticket assigned during reply");
    } else if (email.assignedToEmail !== getAdminEmail(req)) {
      addEmailActivity(email, req, "replied", `Reply added while ticket is assigned to ${email.assignedToName || email.assignedToEmail}`);
    }

    email.status = "replied";
    email.replyMessage = cleanMessage;
    email.replySubject = replySubject;
    email.repliedAt = new Date();
    email.repliedBy = getAdminName(req);
    addEmailActivity(email, req, "replied", `Reply sent: ${replySubject}`);
    await email.save();

    res.status(200).json({ message: "Reply sent successfully", email: await enrichEmailOwnerRole(email) });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to send email reply",
      error: error?.message || "Unknown error",
    });
  }
};

export const forwardEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = getOutboundPayload(req);

    if (!payload.to.length) {
      res.status(400).json({ message: "At least one recipient is required." });
      return;
    }

    if (!payload.body) {
      res.status(400).json({ message: "Forward message is required." });
      return;
    }

    const filter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, filter);
    const email = await EmailMessage.findOne(filter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (payload.fromEmail && !isCpMailbox(payload.fromEmail)) {
      res.status(400).json({ message: "Sender must be a Creativa Poeta mailbox." });
      return;
    }

    const allowedSenders = await getAllowedMailboxAddresses(req);
    if (payload.fromEmail && !allowedSenders.includes(payload.fromEmail)) {
      res.status(403).json({ message: "You cannot send from this mailbox." });
      return;
    }

    const { mailAttachments, metadata } = getUploadedAttachments(req);
    const forwardSubject = normalizeForwardSubject(payload.subject || email.subject);
    const cleanMessage = payload.body.trim();
    const content = `
      ${formatParagraphs(cleanMessage)}
      ${renderQuotedEmailBlock({
        mode: "forward",
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        to: email.to || [],
        cc: email.cc || [],
        subject: email.subject,
        sentAt: email.receivedAt,
        html: email.html,
        text: email.text || email.preview || "",
      })}
    `;

    await sendEmail(payload.to, forwardSubject, content, {
      cc: payload.cc,
      bcc: payload.bcc,
      fromEmail: payload.fromEmail || undefined,
      title: forwardSubject,
      preheader: cleanMessage.slice(0, 130),
      signature: payload.signature,
      attachments: mailAttachments,
    });

    const outbound = await OutboundEmail.create({
      ...payload,
      subject: forwardSubject,
      folder: "sent",
      status: "sent",
      fromEmail: payload.fromEmail || undefined,
      attachments: metadata,
      sentAt: new Date(),
      createdBy: getAdminName(req),
      createdByEmail: getAdminEmail(req),
      updatedBy: getAdminName(req),
      updatedByEmail: getAdminEmail(req),
    });

    addEmailActivity(email, req, "replied", `Forwarded: ${forwardSubject}`);
    await email.save();

    res.status(200).json({ message: "Email forwarded", email: outbound });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to forward email",
      error: error?.message || "Unknown error",
    });
  }
};
export const updateEmailStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = String(req.body?.status || "");

    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid email status" });
      return;
    }

    const statusFilter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, statusFilter);
    const email = await EmailMessage.findOne(statusFilter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (email.status !== status) {
      email.status = status as any;
      addEmailActivity(email, req, "status", `Status changed to ${status}`);
      await email.save();
    }

    res.status(200).json({ message: "Email status updated", email: await enrichEmailOwnerRole(email) });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to update email status",
      error: error?.message || "Unknown error",
    });
  }
};

export const deleteEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleteFilter: any = { _id: req.params.id };
    await applyInboundMailboxAccess(req, deleteFilter);
    const email = await EmailMessage.findOneAndDelete(deleteFilter);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    res.status(200).json({ message: "Email deleted from dashboard copy" });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to delete email",
      error: error?.message || "Unknown error",
    });
  }
};

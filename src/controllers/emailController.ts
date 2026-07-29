import { Request, Response } from "express";
import EmailMessage from "../models/EmailMessage";
import OutboundEmail from "../models/OutboundEmail";
import { syncConfiguredMailboxes } from "../services/emailSyncService";
import sendEmail from "../utils/sendEmail";
import { escapeHtml, formatParagraphs } from "../utils/emailTemplate";

const allowedStatuses = ["new", "read", "replied", "archived"];

const normalizeReplySubject = (subject: string) =>
  /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || "Votre message"}`;

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
});

const sendOutboundPayload = async (
  payload: ReturnType<typeof getOutboundPayload>,
  req: Request
) => {
  if (!payload.to.length) throw new Error("At least one recipient is required.");
  if (!payload.subject) throw new Error("Subject is required.");
  if (!payload.body) throw new Error("Message body is required.");

  await sendEmail(payload.to, payload.subject, formatParagraphs(payload.body), {
    cc: payload.cc,
    bcc: payload.bcc,
    title: payload.subject,
    preheader: payload.body.slice(0, 130),
  });

  return {
    ...payload,
    folder: "sent" as const,
    status: "sent" as const,
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

export const getEmails = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
    const status = String(req.query.status || "all");
    const mailbox = String(req.query.mailbox || "all");
    const search = String(req.query.search || "").trim();
    const filter: any = {};

    if (allowedStatuses.includes(status)) filter.status = status;
    if (mailbox !== "all") filter.mailbox = mailbox;

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
    const [emails, totalEmails, counts] = await Promise.all([
      EmailMessage.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit),
      EmailMessage.countDocuments(filter),
      EmailMessage.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      message: "Emails fetched successfully",
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
      OutboundEmail.aggregate([{ $group: { _id: "$folder", count: { $sum: 1 } } }]),
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
    const email = await EmailMessage.findById(req.params.id);

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    if (email.status === "new") {
      email.status = "read";
      await email.save();
    }

    res.status(200).json({ message: "Email fetched successfully", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to fetch email",
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
    const email = await OutboundEmail.findOneAndUpdate(
      { _id: req.params.id, folder: "draft" },
      { ...payload, updatedBy: getAdminName(req) },
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
      ? await OutboundEmail.findByIdAndUpdate(draftId, sentPayload, { new: true })
      : await OutboundEmail.create({ ...sentPayload, createdBy: getAdminName(req) });

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
    const draft = await OutboundEmail.findOne({ _id: req.params.id, folder: "draft" });

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
    const email = await OutboundEmail.findByIdAndDelete(req.params.id);

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
    const { replyMessage, subject } = req.body;

    if (!replyMessage || !String(replyMessage).trim()) {
      res.status(400).json({ message: "Reply message is required" });
      return;
    }

    const email = await EmailMessage.findById(req.params.id);

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
    const originalText = email.text || email.preview || "";
    const content = `
      <p>Bonjour${email.fromName ? ` ${escapeHtml(email.fromName)}` : ""},</p>
      <div style="background:#fff7db;border-left:5px solid #eeba2b;border-radius:10px;padding:18px;margin:18px 0;color:#071a33;">
        ${formatParagraphs(cleanMessage)}
      </div>
      <p>Vous pouvez repondre directement a cet email si vous souhaitez preciser quelque chose.</p>
      <hr style="border:0;border-top:1px solid #dfe7f2;margin:26px 0;" />
      <p style="font-size:13px;color:#64748b;margin-bottom:8px;"><strong>Message original</strong></p>
      <div style="font-size:13px;color:#64748b;background:#f8fafc;border-radius:10px;padding:14px;">
        <p style="margin:0 0 8px;"><strong>De:</strong> ${escapeHtml(email.fromEmail)}</p>
        <p style="margin:0 0 8px;"><strong>Sujet:</strong> ${escapeHtml(email.subject)}</p>
        ${formatParagraphs(originalText.slice(0, 1600))}
      </div>
    `;

    await sendEmail(email.fromEmail, replySubject, content, {
      title: replySubject,
      preheader: cleanMessage.slice(0, 130),
    });

    email.status = "replied";
    email.replyMessage = cleanMessage;
    email.replySubject = replySubject;
    email.repliedAt = new Date();
    email.repliedBy = getAdminName(req);
    await email.save();

    res.status(200).json({ message: "Reply sent successfully", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to send email reply",
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

    const email = await EmailMessage.findByIdAndUpdate(req.params.id, { status }, { new: true });

    if (!email) {
      res.status(404).json({ message: "Email not found" });
      return;
    }

    res.status(200).json({ message: "Email status updated", email });
  } catch (error: any) {
    res.status(500).json({
      message: "Failed to update email status",
      error: error?.message || "Unknown error",
    });
  }
};

export const deleteEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = await EmailMessage.findByIdAndDelete(req.params.id);

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

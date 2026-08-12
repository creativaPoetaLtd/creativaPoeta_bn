import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import WhatsAppConversation, {
  WhatsAppConversationStatus,
} from "../models/WhatsAppConversation";
import WhatsAppMessage from "../models/WhatsAppMessage";
import {
  isWhatsAppServiceWindowOpen,
  validateWhatsAppText,
  verifyWhatsAppSignature,
} from "../domain/whatsAppPolicy";
import {
  getWhatsAppConfiguration,
  markWhatsAppMessageRead,
  processWhatsAppWebhook,
  sendWhatsAppTextMessage,
} from "../services/whatsAppService";

const conversationStatuses: WhatsAppConversationStatus[] = [
  "open",
  "waiting",
  "resolved",
  "closed",
  "spam",
];

const getAdminEmail = (req: Request) =>
  String(req.user?.email || "").toLowerCase().trim();
const getAdminName = (req: Request) =>
  String(req.user?.name || req.user?.email || "Admin").trim();

const addActivity = (
  conversation: any,
  req: Request,
  type: "assigned" | "released" | "status" | "note" | "outbound",
  message: string
) => {
  conversation.activity = conversation.activity || [];
  conversation.activity.push({
    type,
    message,
    actorEmail: getAdminEmail(req),
    actorName: getAdminName(req),
    at: new Date(),
  });
  if (conversation.activity.length > 100) {
    conversation.activity = conversation.activity.slice(-100);
  }
};

const isOwnedByAnother = (req: Request, conversation: any) =>
  Boolean(
    conversation.assignedToEmail && conversation.assignedToEmail !== getAdminEmail(req)
  );

const assignToCurrentUser = (conversation: any, req: Request) => {
  conversation.assignedToEmail = getAdminEmail(req);
  conversation.assignedToName = getAdminName(req);
  conversation.assignedAt = new Date();
  addActivity(conversation, req, "assigned", "Conversation prise en charge");
};

export const verifyWhatsAppWebhook = (req: Request, res: Response): void => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || "";

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
};

export const receiveWhatsAppWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET || "";
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.headers["x-hub-signature-256"];

    if (!appSecret) {
      res.status(503).json({ message: "WhatsApp webhook is not configured." });
      return;
    }
    if (!rawBody || !verifyWhatsAppSignature(rawBody, signature, appSecret)) {
      res.status(401).json({ message: "Invalid WhatsApp webhook signature." });
      return;
    }

    await processWhatsAppWebhook(req.body);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};

export const getWhatsAppSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const [open, waiting, unread, unassigned, assignedToMe, resolved, spam, attention] = await Promise.all([
      WhatsAppConversation.countDocuments({ status: "open" }),
      WhatsAppConversation.countDocuments({ status: "waiting" }),
      WhatsAppConversation.countDocuments({ unreadCount: { $gt: 0 }, status: { $ne: "spam" } }),
      WhatsAppConversation.countDocuments({
        assignedToEmail: { $exists: false },
        status: { $in: ["open", "waiting"] },
      }),
      WhatsAppConversation.countDocuments({
        assignedToEmail: getAdminEmail(req),
        status: { $in: ["open", "waiting"] },
      }),
      WhatsAppConversation.countDocuments({ status: "resolved" }),
      WhatsAppConversation.countDocuments({ status: "spam" }),
      WhatsAppConversation.countDocuments({
        status: { $in: ["open", "waiting"] },
        $or: [{ unreadCount: { $gt: 0 } }, { assignedToEmail: { $exists: false } }],
      }),
    ]);

    res.status(200).json({
      configured: getWhatsAppConfiguration().configured,
      metrics: {
        open,
        waiting,
        unread,
        unassigned,
        assignedToMe,
        resolved,
        spam,
        attention,
      },
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch WhatsApp summary." });
  }
};

export const getWhatsAppConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "30"), 10) || 30));
    const status = String(req.query.status || "all");
    const owner = String(req.query.owner || "all");
    const search = String(req.query.search || "").trim();
    const filter: Record<string, any> = {};

    if (status !== "all" && conversationStatuses.includes(status as WhatsAppConversationStatus)) {
      filter.status = status;
    }
    if (owner === "mine") filter.assignedToEmail = getAdminEmail(req);
    if (owner === "unassigned") filter.assignedToEmail = { $exists: false };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { displayName: { $regex: escaped, $options: "i" } },
        { waId: { $regex: escaped, $options: "i" } },
        { lastMessagePreview: { $regex: escaped, $options: "i" } },
      ];
    }

    const [conversations, total] = await Promise.all([
      WhatsAppConversation.find(filter)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WhatsAppConversation.countDocuments(filter),
    ]);

    res.status(200).json({
      configured: getWhatsAppConfiguration().configured,
      conversations,
      pagination: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        totalConversations: total,
        limit,
      },
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch WhatsApp conversations." });
  }
};

export const getWhatsAppConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }

    const messages = await WhatsAppMessage.find({ conversationId: conversation._id })
      .sort({ providerTimestamp: 1, createdAt: 1 })
      .limit(500)
      .lean();
    const latestInbound = [...messages]
      .reverse()
      .find((message) => message.direction === "inbound");

    conversation.unreadCount = 0;
    await conversation.save();
    if (latestInbound?.providerMessageId) {
      void markWhatsAppMessageRead(latestInbound.providerMessageId);
    }

    res.status(200).json({
      configured: getWhatsAppConfiguration().configured,
      conversation,
      messages,
    });
  } catch {
    res.status(500).json({ message: "Failed to fetch WhatsApp conversation." });
  }
};

export const claimWhatsAppConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }
    if (isOwnedByAnother(req, conversation)) {
      res.status(409).json({
        message: `This conversation is already handled by ${conversation.assignedToName || conversation.assignedToEmail}.`,
        conversation,
      });
      return;
    }
    if (!conversation.assignedToEmail) assignToCurrentUser(conversation, req);
    await conversation.save();
    res.status(200).json({ message: "Conversation assigned.", conversation });
  } catch {
    res.status(500).json({ message: "Failed to assign WhatsApp conversation." });
  }
};

export const releaseWhatsAppConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }
    if (isOwnedByAnother(req, conversation)) {
      res.status(403).json({ message: "Only the assigned admin can release this conversation." });
      return;
    }
    const previousOwner = conversation.assignedToName || conversation.assignedToEmail || "an admin";
    conversation.assignedToEmail = undefined;
    conversation.assignedToName = undefined;
    conversation.assignedAt = undefined;
    addActivity(conversation, req, "released", `Conversation liberee de ${previousOwner}`);
    await conversation.save();
    res.status(200).json({ message: "Conversation released.", conversation });
  } catch {
    res.status(500).json({ message: "Failed to release WhatsApp conversation." });
  }
};

export const updateWhatsAppConversationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const status = String(req.body?.status || "") as WhatsAppConversationStatus;
    if (!conversationStatuses.includes(status)) {
      res.status(400).json({ message: "Invalid WhatsApp conversation status." });
      return;
    }
    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }
    if (isOwnedByAnother(req, conversation)) {
      res.status(409).json({ message: "This conversation is assigned to another admin." });
      return;
    }
    if (conversation.status !== status) {
      conversation.status = status;
      addActivity(conversation, req, "status", `Statut change en ${status}`);
      await conversation.save();
    }
    res.status(200).json({ message: "Conversation status updated.", conversation });
  } catch {
    res.status(500).json({ message: "Failed to update WhatsApp status." });
  }
};

export const addWhatsAppConversationNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const note = String(req.body?.note || "").trim();
    if (!note || note.length > 2000) {
      res.status(400).json({ message: "A note of 1 to 2000 characters is required." });
      return;
    }
    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }
    addActivity(conversation, req, "note", note);
    await conversation.save();
    res.status(200).json({ message: "Internal note added.", conversation });
  } catch {
    res.status(500).json({ message: "Failed to add internal note." });
  }
};

export const replyToWhatsAppConversation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let text: string;
    try {
      text = validateWhatsAppText(req.body?.message);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid message." });
      return;
    }

    const conversation = await WhatsAppConversation.findById(req.params.id);
    if (!conversation) {
      res.status(404).json({ message: "WhatsApp conversation not found." });
      return;
    }
    if (isOwnedByAnother(req, conversation)) {
      res.status(409).json({
        message: `This conversation is already handled by ${conversation.assignedToName || conversation.assignedToEmail}.`,
      });
      return;
    }
    if (!isWhatsAppServiceWindowOpen(conversation.serviceWindowExpiresAt)) {
      res.status(409).json({
        code: "WHATSAPP_SERVICE_WINDOW_CLOSED",
        message:
          "The 24-hour WhatsApp service window is closed. Use an approved Meta template before sending another free-form message.",
      });
      return;
    }

    if (!conversation.assignedToEmail) assignToCurrentUser(conversation, req);
    const now = new Date();
    const message = await WhatsAppMessage.create({
      conversationId: conversation._id,
      providerMessageId: `local:${crypto.randomUUID()}`,
      direction: "outbound",
      type: "text",
      text,
      status: "queued",
      from: conversation.phoneNumberId,
      to: conversation.waId,
      providerTimestamp: now,
      sentByEmail: getAdminEmail(req),
      sentByName: getAdminName(req),
    });

    try {
      const sent = await sendWhatsAppTextMessage(conversation.waId, text);
      message.providerMessageId = sent.providerMessageId;
      message.status = "sent";
      await message.save();
    } catch (error) {
      message.status = "failed";
      message.errorMessage = error instanceof Error ? error.message : "Meta delivery failed.";
      await message.save();
      throw error;
    }

    conversation.lastMessagePreview = text.slice(0, 500);
    conversation.lastMessageAt = now;
    conversation.lastDirection = "outbound";
    conversation.lastOutboundAt = now;
    conversation.status = "waiting";
    addActivity(conversation, req, "outbound", "Reponse WhatsApp envoyee");
    await conversation.save();

    res.status(200).json({ message: "WhatsApp reply sent.", conversation, sentMessage: message });
  } catch (error) {
    res.status(502).json({
      message: error instanceof Error ? error.message : "Failed to send WhatsApp reply.",
    });
  }
};

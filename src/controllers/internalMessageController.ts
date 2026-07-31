import { Request, Response } from "express";
import InternalConversation from "../models/InternalConversation";
import User from "../models/User";
import { getEffectiveAdminRole, normalizeAdminRole } from "../middleware/authMiddleware";

const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();

const groupLabel = (groupKey: string): string => {
  if (/^level_\d$/.test(groupKey)) return `Niveau ${groupKey.replace("level_", "")}`;
  if (/^levels_0_\d$/.test(groupKey)) return `Niveaux 0-${groupKey.replace("levels_0_", "")}`;
  return groupKey;
};

const getRoleInternalGroups = (role?: string, email?: string): string[] => {
  const effectiveRole = getEffectiveAdminRole(role, email);
  if (effectiveRole === "super_admin") return [];

  const normalizedRole = normalizeAdminRole(effectiveRole);
  if (!normalizedRole.startsWith("admin_")) return [];

  const level = Number(normalizedRole.replace("admin_", ""));
  if (Number.isNaN(level)) return [];

  const groups = [`level_${level}`];
  for (let max = level; max <= 5; max += 1) {
    groups.push(`levels_0_${max}`);
  }

  return groups;
};

const getCurrentUserContext = async (req: Request) => {
  const email = normalizeEmail(req.user?.email);
  const user = req.user?._id ? await User.findById(req.user._id).lean() : null;
  const userRecord = user as any;
  const role = getEffectiveAdminRole(userRecord?.role || req.user?.role, userRecord?.email || email);
  const groups = Array.from(
    new Set([...(userRecord?.internalGroups || []), ...getRoleInternalGroups(role, email)])
  );

  return {
    email,
    name: userRecord?.name || req.user?.name || email,
    role,
    groups,
  };
};

const canAccessConversation = (conversation: any, email: string, groups: string[]): boolean =>
  Boolean(
    conversation.participantEmails?.includes(email) ||
      (conversation.groupKey && groups.includes(conversation.groupKey))
  );

const unreadCountFor = (conversation: any, email: string): number =>
  (conversation.messages || []).filter(
    (message: any) => message.senderEmail !== email && !(message.readByEmails || []).includes(email)
  ).length;

const serializeConversation = (conversation: any, email: string, includeMessages = true) => {
  const messages = conversation.messages || [];
  const lastMessage = messages.length ? messages[messages.length - 1] : null;

  return {
    id: conversation._id,
    _id: conversation._id,
    title: conversation.title,
    type: conversation.type,
    groupKey: conversation.groupKey,
    participantEmails: conversation.participantEmails || [],
    createdByEmail: conversation.createdByEmail,
    messages: includeMessages ? messages : undefined,
    lastMessage,
    unreadCount: unreadCountFor(conversation, email),
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

const ensureGroupConversations = async (context: { email: string; groups: string[] }) => {
  await Promise.all(
    context.groups.map((groupKey) =>
      InternalConversation.findOneAndUpdate(
        { groupKey },
        {
          $setOnInsert: {
            title: groupLabel(groupKey),
            type: "group",
            groupKey,
            participantEmails: [],
            createdByEmail: context.email,
            messages: [],
          },
        },
        { upsert: true, new: true }
      )
    )
  );
};

export const listInternalConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const context = await getCurrentUserContext(req);
    await ensureGroupConversations(context);

    const conversations = await InternalConversation.find({
      $or: [{ participantEmails: context.email }, { groupKey: { $in: context.groups } }],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    res.status(200).json({
      conversations: conversations.map((conversation) =>
        serializeConversation(conversation, context.email, true)
      ),
    });
  } catch (error) {
    console.error("Failed to list internal conversations", error);
    res.status(500).json({ message: "Unable to load internal messages." });
  }
};

export const getInternalMessageSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const context = await getCurrentUserContext(req);
    await ensureGroupConversations(context);

    const conversations = await InternalConversation.find({
      $or: [{ participantEmails: context.email }, { groupKey: { $in: context.groups } }],
    }).lean();

    const unread = conversations.reduce(
      (total, conversation) => total + unreadCountFor(conversation, context.email),
      0
    );

    res.status(200).json({
      metrics: {
        total: conversations.length,
        unread,
      },
    });
  } catch (error) {
    console.error("Failed to load internal message summary", error);
    res.status(500).json({ message: "Unable to load internal message summary." });
  }
};

export const createInternalConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const context = await getCurrentUserContext(req);
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const participantEmails = Array.from(
      new Set([context.email, ...(req.body?.participantEmails || []).map(normalizeEmail).filter(Boolean)])
    );

    if (!title || participantEmails.length < 2) {
      res.status(400).json({ message: "Title and at least one recipient are required." });
      return;
    }

    const messages = body
      ? [
          {
            body,
            senderEmail: context.email,
            senderName: context.name,
            readByEmails: [context.email],
            createdAt: new Date(),
          },
        ]
      : [];

    const conversation = await InternalConversation.create({
      title,
      type: participantEmails.length === 2 ? "direct" : "custom",
      participantEmails,
      createdByEmail: context.email,
      messages,
      lastMessageAt: body ? new Date() : undefined,
    });

    res.status(201).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
  } catch (error) {
    console.error("Failed to create internal conversation", error);
    res.status(500).json({ message: "Unable to create internal conversation." });
  }
};

export const sendInternalMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const context = await getCurrentUserContext(req);
    const body = String(req.body?.body || "").trim();

    if (!body) {
      res.status(400).json({ message: "Message is required." });
      return;
    }

    const conversation = await InternalConversation.findById(req.params.id);
    if (!conversation || !canAccessConversation(conversation, context.email, context.groups)) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }

    conversation.messages.push({
      body,
      senderEmail: context.email,
      senderName: context.name,
      readByEmails: [context.email],
      createdAt: new Date(),
    } as any);
    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.status(200).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
  } catch (error) {
    console.error("Failed to send internal message", error);
    res.status(500).json({ message: "Unable to send internal message." });
  }
};

export const markInternalConversationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const context = await getCurrentUserContext(req);
    const conversation = await InternalConversation.findById(req.params.id);

    if (!conversation || !canAccessConversation(conversation, context.email, context.groups)) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }

    conversation.messages.forEach((message: any) => {
      const readers = new Set(message.readByEmails || []);
      readers.add(context.email);
      message.readByEmails = Array.from(readers);
    });

    await conversation.save();
    res.status(200).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
  } catch (error) {
    console.error("Failed to mark internal conversation read", error);
    res.status(500).json({ message: "Unable to update internal conversation." });
  }
};

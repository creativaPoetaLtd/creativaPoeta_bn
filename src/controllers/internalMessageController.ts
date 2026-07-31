import { Request, Response } from "express";
import InternalConversation from "../models/InternalConversation";
import User from "../models/User";
import { getEffectiveAdminRole, normalizeAdminRole } from "../middleware/authMiddleware";

const normalizeEmail = (email: unknown) => String(email || "").trim().toLowerCase();

const CPG_GROUP_KEYS = [
  "CPG0",
  "CPG1",
  "CPG2",
  "CPG3",
  "CPG4",
  "CPG5",
  "CPG01",
  "CPG02",
  "CPG03",
  "CPG04",
  "CPG05",
  "CPG12",
  "CPG13",
  "CPG14",
  "CPG15",
  "CPG23",
  "CPG24",
  "CPG25",
  "CPG34",
  "CPG35",
  "CPG45",
];

const levelColors: Record<number, { label: string; color: string; background: string }> = {
  0: { label: "Level 0", color: "#7c2d12", background: "#f5d0b8" },
  1: { label: "Level 1", color: "#1d4ed8", background: "#dbeafe" },
  2: { label: "Level 2", color: "#047857", background: "#d1fae5" },
  3: { label: "Level 3", color: "#c2410c", background: "#ffedd5" },
  4: { label: "Level 4", color: "#a16207", background: "#fef3c7" },
  5: { label: "Level 5", color: "#475569", background: "#f8fafc" },
};

const getGroupLevels = (groupKey: string): number[] => {
  if (!/^CPG\d{1,2}$/.test(groupKey)) return [];
  const digits = groupKey.replace("CPG", "");
  if (digits.length === 1) return [Number(digits)];
  const start = Number(digits[0]);
  const end = Number(digits[1]);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const groupLabel = (groupKey: string): string => {
  const levels = getGroupLevels(groupKey);
  if (!levels.length) return groupKey;
  if (levels.length === 1) return `${groupKey} - Level ${levels[0]}`;
  return `${groupKey} - Levels ${levels[0]}-${levels[levels.length - 1]}`;
};

const groupMeta = (groupKey: string) => {
  const levels = getGroupLevels(groupKey);
  const ownerLevel = levels[0] ?? 5;
  const color = levelColors[ownerLevel] || levelColors[5];
  return {
    key: groupKey,
    label: groupLabel(groupKey),
    levels,
    ownerLevel,
    color: color.color,
    background: color.background,
  };
};

const getRoleInternalGroups = (role?: string, email?: string): string[] => {
  const effectiveRole = getEffectiveAdminRole(role, email);
  if (effectiveRole === "super_admin") return [];

  const normalizedRole = normalizeAdminRole(effectiveRole);
  if (!normalizedRole.startsWith("admin_")) return [];

  const level = Number(normalizedRole.replace("admin_", ""));
  if (Number.isNaN(level)) return [];

  return CPG_GROUP_KEYS.filter((groupKey) => getGroupLevels(groupKey).includes(level));
};

const getCurrentUserContext = async (req: Request) => {
  const email = normalizeEmail(req.user?.email);
  const user = req.user?._id ? await User.findById(req.user._id).lean() : null;
  const userRecord = user as any;
  const role = getEffectiveAdminRole(userRecord?.role || req.user?.role, userRecord?.email || email);
  const groups = Array.from(
    new Set([...(userRecord?.internalGroups || []), ...getRoleInternalGroups(role, email)])
  ).filter((group) => CPG_GROUP_KEYS.includes(group));

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
    groupMeta: conversation.groupKey ? groupMeta(conversation.groupKey) : undefined,
    participantEmails: conversation.participantEmails || [],
    createdByEmail: conversation.createdByEmail,
    messages: includeMessages ? messages : undefined,
    lastMessage,
    hasMessages: messages.length > 0,
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

const getUserDirectory = async () => {
  const users = await User.find({ isActive: true }, "name email role accountStatus").sort({ name: 1 }).lean();
  return users
    .map((user: any) => {
      const role = getEffectiveAdminRole(user.role, user.email);
      return {
        name: user.name,
        email: normalizeEmail(user.email),
        role,
        roleLabel: role.startsWith("admin_") ? role.replace("admin_", "Level ") : "Admin",
      };
    })
    .filter((user) => user.email && user.role !== "super_admin");
};

const buildCustomTitle = async (participantEmails: string[], body: string, fallbackName: string) => {
  const others = participantEmails.filter(Boolean).slice(0, 4);
  if (others.length) {
    const users = await User.find({ email: { $in: others } }, "name email").lean();
    const names = users.map((user: any) => user.name || user.email).filter(Boolean);
    if (names.length) return `Conversation with ${names.join(", ")}`;
  }
  const preview = body.replace(/\s+/g, " ").trim().slice(0, 48);
  return preview || `Conversation with ${fallbackName}`;
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
      groups: context.groups.map(groupMeta),
      users: await getUserDirectory(),
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
    const rawTitle = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const requestedRecipients = Array.from(
      new Set((req.body?.participantEmails || []).map(normalizeEmail).filter(Boolean))
    );
    const activeRecipients = await User.find({ email: { $in: requestedRecipients }, isActive: true }, "email").lean();
    const allowedRecipientEmails = activeRecipients.map((user: any) => normalizeEmail(user.email));
    const participantEmails = Array.from(new Set([context.email, ...allowedRecipientEmails]));

    if (participantEmails.length < 2) {
      res.status(400).json({ message: "Select at least one active CP user." });
      return;
    }

    const title = rawTitle || (await buildCustomTitle(allowedRecipientEmails, body, context.name));
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

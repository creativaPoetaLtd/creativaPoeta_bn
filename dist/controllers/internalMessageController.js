"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markInternalConversationRead = exports.sendInternalMessage = exports.createInternalConversation = exports.getInternalMessageSummary = exports.listInternalConversations = void 0;
const InternalConversation_1 = __importDefault(require("../models/InternalConversation"));
const User_1 = __importDefault(require("../models/User"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
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
const levelColors = {
    0: { color: "#7c2d12", background: "#f5d0b8" },
    1: { color: "#1d4ed8", background: "#dbeafe" },
    2: { color: "#047857", background: "#d1fae5" },
    3: { color: "#c2410c", background: "#ffedd5" },
    4: { color: "#a16207", background: "#fef3c7" },
    5: { color: "#475569", background: "#f8fafc" },
};
const getGroupLevels = (groupKey) => {
    if (!/^CPG\d{1,2}$/.test(groupKey))
        return [];
    const digits = groupKey.replace("CPG", "");
    if (digits.length === 1)
        return [Number(digits)];
    const start = Number(digits[0]);
    const end = Number(digits[1]);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end)
        return [];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
const groupLabel = (groupKey) => groupKey;
const groupMeta = (groupKey) => {
    var _a;
    const levels = getGroupLevels(groupKey);
    const ownerLevel = (_a = levels[0]) !== null && _a !== void 0 ? _a : 5;
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
const getRoleInternalGroups = (role, email) => {
    const effectiveRole = (0, authMiddleware_1.getEffectiveAdminRole)(role, email);
    if (effectiveRole === "super_admin")
        return [];
    const normalizedRole = (0, authMiddleware_1.normalizeAdminRole)(effectiveRole);
    if (!normalizedRole.startsWith("admin_"))
        return [];
    const level = Number(normalizedRole.replace("admin_", ""));
    if (Number.isNaN(level))
        return [];
    return CPG_GROUP_KEYS.filter((groupKey) => getGroupLevels(groupKey).includes(level));
};
const getCurrentUserContext = async (req) => {
    var _a, _b, _c, _d;
    const email = normalizeEmail((_a = req.user) === null || _a === void 0 ? void 0 : _a.email);
    const user = ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) ? await User_1.default.findById(req.user._id).lean() : null;
    const userRecord = user;
    const role = (0, authMiddleware_1.getEffectiveAdminRole)((userRecord === null || userRecord === void 0 ? void 0 : userRecord.role) || ((_c = req.user) === null || _c === void 0 ? void 0 : _c.role), (userRecord === null || userRecord === void 0 ? void 0 : userRecord.email) || email);
    const groups = Array.from(new Set([...((userRecord === null || userRecord === void 0 ? void 0 : userRecord.internalGroups) || []), ...getRoleInternalGroups(role, email)])).filter((group) => CPG_GROUP_KEYS.includes(group));
    return {
        email,
        name: (userRecord === null || userRecord === void 0 ? void 0 : userRecord.name) || ((_d = req.user) === null || _d === void 0 ? void 0 : _d.name) || email,
        role,
        groups,
    };
};
const canAccessConversation = (conversation, email, groups) => {
    var _a;
    return Boolean(((_a = conversation.participantEmails) === null || _a === void 0 ? void 0 : _a.includes(email)) ||
        (conversation.groupKey && groups.includes(conversation.groupKey)));
};
const unreadCountFor = (conversation, email) => (conversation.messages || []).filter((message) => message.senderEmail !== email && !(message.readByEmails || []).includes(email)).length;
const serializeConversation = (conversation, email, includeMessages = true) => {
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
const ensureGroupConversations = async (context) => {
    await Promise.all(context.groups.map((groupKey) => InternalConversation_1.default.findOneAndUpdate({ groupKey }, {
        $setOnInsert: {
            title: groupLabel(groupKey),
            type: "group",
            groupKey,
            participantEmails: [],
            createdByEmail: context.email,
            messages: [],
        },
    }, { upsert: true, new: true })));
};
const getUserDirectory = async () => {
    const users = await User_1.default.find({ isActive: true }, "name email role accountStatus").sort({ name: 1 }).lean();
    return users
        .map((user) => {
        const role = (0, authMiddleware_1.getEffectiveAdminRole)(user.role, user.email);
        return {
            name: user.name,
            email: normalizeEmail(user.email),
            role,
            roleLabel: role.startsWith("admin_") ? role.replace("admin_", "CPG") : "Admin",
        };
    })
        .filter((user) => user.email && user.role !== "super_admin");
};
const buildCustomTitle = async (participantEmails, body, fallbackName) => {
    const others = participantEmails.filter(Boolean).slice(0, 4);
    if (others.length) {
        const users = await User_1.default.find({ email: { $in: others } }, "name email").lean();
        const names = users.map((user) => user.name || user.email).filter(Boolean);
        if (names.length)
            return `Conversation with ${names.join(", ")}`;
    }
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 48);
    return preview || `Conversation with ${fallbackName}`;
};
const listInternalConversations = async (req, res) => {
    try {
        const context = await getCurrentUserContext(req);
        await ensureGroupConversations(context);
        const conversations = await InternalConversation_1.default.find({
            $or: [{ participantEmails: context.email }, { groupKey: { $in: context.groups } }],
        })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .lean();
        res.status(200).json({
            conversations: conversations.map((conversation) => serializeConversation(conversation, context.email, true)),
            groups: context.groups.map(groupMeta),
            users: await getUserDirectory(),
        });
    }
    catch (error) {
        console.error("Failed to list internal conversations", error);
        res.status(500).json({ message: "Unable to load internal messages." });
    }
};
exports.listInternalConversations = listInternalConversations;
const getInternalMessageSummary = async (req, res) => {
    try {
        const context = await getCurrentUserContext(req);
        await ensureGroupConversations(context);
        const conversations = await InternalConversation_1.default.find({
            $or: [{ participantEmails: context.email }, { groupKey: { $in: context.groups } }],
        }).lean();
        const unread = conversations.reduce((total, conversation) => total + unreadCountFor(conversation, context.email), 0);
        res.status(200).json({
            metrics: {
                total: conversations.length,
                unread,
            },
        });
    }
    catch (error) {
        console.error("Failed to load internal message summary", error);
        res.status(500).json({ message: "Unable to load internal message summary." });
    }
};
exports.getInternalMessageSummary = getInternalMessageSummary;
const createInternalConversation = async (req, res) => {
    var _a, _b, _c;
    try {
        const context = await getCurrentUserContext(req);
        const rawTitle = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.title) || "").trim();
        const body = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.body) || "").trim();
        const requestedRecipients = Array.from(new Set((((_c = req.body) === null || _c === void 0 ? void 0 : _c.participantEmails) || []).map(normalizeEmail).filter(Boolean)));
        const activeRecipients = await User_1.default.find({ email: { $in: requestedRecipients }, isActive: true }, "email").lean();
        const allowedRecipientEmails = activeRecipients.map((user) => normalizeEmail(user.email));
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
        const conversation = await InternalConversation_1.default.create({
            title,
            type: participantEmails.length === 2 ? "direct" : "custom",
            participantEmails,
            createdByEmail: context.email,
            messages,
            lastMessageAt: body ? new Date() : undefined,
        });
        res.status(201).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
    }
    catch (error) {
        console.error("Failed to create internal conversation", error);
        res.status(500).json({ message: "Unable to create internal conversation." });
    }
};
exports.createInternalConversation = createInternalConversation;
const sendInternalMessage = async (req, res) => {
    var _a;
    try {
        const context = await getCurrentUserContext(req);
        const body = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.body) || "").trim();
        if (!body) {
            res.status(400).json({ message: "Message is required." });
            return;
        }
        const conversation = await InternalConversation_1.default.findById(req.params.id);
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
        });
        conversation.lastMessageAt = new Date();
        await conversation.save();
        res.status(200).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
    }
    catch (error) {
        console.error("Failed to send internal message", error);
        res.status(500).json({ message: "Unable to send internal message." });
    }
};
exports.sendInternalMessage = sendInternalMessage;
const markInternalConversationRead = async (req, res) => {
    try {
        const context = await getCurrentUserContext(req);
        const conversation = await InternalConversation_1.default.findById(req.params.id);
        if (!conversation || !canAccessConversation(conversation, context.email, context.groups)) {
            res.status(404).json({ message: "Conversation not found." });
            return;
        }
        conversation.messages.forEach((message) => {
            const readers = new Set(message.readByEmails || []);
            readers.add(context.email);
            message.readByEmails = Array.from(readers);
        });
        await conversation.save();
        res.status(200).json({ conversation: serializeConversation(conversation.toObject(), context.email) });
    }
    catch (error) {
        console.error("Failed to mark internal conversation read", error);
        res.status(500).json({ message: "Unable to update internal conversation." });
    }
};
exports.markInternalConversationRead = markInternalConversationRead;

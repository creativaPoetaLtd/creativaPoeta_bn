"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replyToWhatsAppConversation = exports.addWhatsAppConversationNote = exports.updateWhatsAppConversationStatus = exports.releaseWhatsAppConversation = exports.claimWhatsAppConversation = exports.getWhatsAppConversation = exports.getWhatsAppConversations = exports.getWhatsAppSummary = exports.receiveWhatsAppWebhook = exports.verifyWhatsAppWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const WhatsAppConversation_1 = __importDefault(require("../models/WhatsAppConversation"));
const WhatsAppMessage_1 = __importDefault(require("../models/WhatsAppMessage"));
const whatsAppPolicy_1 = require("../domain/whatsAppPolicy");
const whatsAppService_1 = require("../services/whatsAppService");
const conversationStatuses = [
    "open",
    "waiting",
    "resolved",
    "closed",
    "spam",
];
const getAdminEmail = (req) => { var _a; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || "").toLowerCase().trim(); };
const getAdminName = (req) => { var _a, _b; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin").trim(); };
const addActivity = (conversation, req, type, message) => {
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
const isOwnedByAnother = (req, conversation) => Boolean(conversation.assignedToEmail && conversation.assignedToEmail !== getAdminEmail(req));
const assignToCurrentUser = (conversation, req) => {
    conversation.assignedToEmail = getAdminEmail(req);
    conversation.assignedToName = getAdminName(req);
    conversation.assignedAt = new Date();
    addActivity(conversation, req, "assigned", "Conversation prise en charge");
};
const verifyWhatsAppWebhook = (req, res) => {
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
exports.verifyWhatsAppWebhook = verifyWhatsAppWebhook;
const receiveWhatsAppWebhook = async (req, res, next) => {
    try {
        const appSecret = process.env.WHATSAPP_APP_SECRET || "";
        const rawBody = req.rawBody;
        const signature = req.headers["x-hub-signature-256"];
        if (!appSecret) {
            res.status(503).json({ message: "WhatsApp webhook is not configured." });
            return;
        }
        if (!rawBody || !(0, whatsAppPolicy_1.verifyWhatsAppSignature)(rawBody, signature, appSecret)) {
            res.status(401).json({ message: "Invalid WhatsApp webhook signature." });
            return;
        }
        await (0, whatsAppService_1.processWhatsAppWebhook)(req.body);
        res.sendStatus(200);
    }
    catch (error) {
        next(error);
    }
};
exports.receiveWhatsAppWebhook = receiveWhatsAppWebhook;
const getWhatsAppSummary = async (req, res) => {
    try {
        const [open, waiting, unread, unassigned, assignedToMe, resolved, spam, attention] = await Promise.all([
            WhatsAppConversation_1.default.countDocuments({ status: "open" }),
            WhatsAppConversation_1.default.countDocuments({ status: "waiting" }),
            WhatsAppConversation_1.default.countDocuments({ unreadCount: { $gt: 0 }, status: { $ne: "spam" } }),
            WhatsAppConversation_1.default.countDocuments({
                assignedToEmail: { $exists: false },
                status: { $in: ["open", "waiting"] },
            }),
            WhatsAppConversation_1.default.countDocuments({
                assignedToEmail: getAdminEmail(req),
                status: { $in: ["open", "waiting"] },
            }),
            WhatsAppConversation_1.default.countDocuments({ status: "resolved" }),
            WhatsAppConversation_1.default.countDocuments({ status: "spam" }),
            WhatsAppConversation_1.default.countDocuments({
                status: { $in: ["open", "waiting"] },
                $or: [{ unreadCount: { $gt: 0 } }, { assignedToEmail: { $exists: false } }],
            }),
        ]);
        res.status(200).json({
            configured: (0, whatsAppService_1.getWhatsAppConfiguration)().configured,
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
    }
    catch {
        res.status(500).json({ message: "Failed to fetch WhatsApp summary." });
    }
};
exports.getWhatsAppSummary = getWhatsAppSummary;
const getWhatsAppConversations = async (req, res) => {
    try {
        const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "30"), 10) || 30));
        const status = String(req.query.status || "all");
        const owner = String(req.query.owner || "all");
        const search = String(req.query.search || "").trim();
        const filter = {};
        if (status !== "all" && conversationStatuses.includes(status)) {
            filter.status = status;
        }
        if (owner === "mine")
            filter.assignedToEmail = getAdminEmail(req);
        if (owner === "unassigned")
            filter.assignedToEmail = { $exists: false };
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { displayName: { $regex: escaped, $options: "i" } },
                { waId: { $regex: escaped, $options: "i" } },
                { lastMessagePreview: { $regex: escaped, $options: "i" } },
            ];
        }
        const [conversations, total] = await Promise.all([
            WhatsAppConversation_1.default.find(filter)
                .sort({ lastMessageAt: -1, updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            WhatsAppConversation_1.default.countDocuments(filter),
        ]);
        res.status(200).json({
            configured: (0, whatsAppService_1.getWhatsAppConfiguration)().configured,
            conversations,
            pagination: {
                currentPage: page,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                totalConversations: total,
                limit,
            },
        });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch WhatsApp conversations." });
    }
};
exports.getWhatsAppConversations = getWhatsAppConversations;
const getWhatsAppConversation = async (req, res) => {
    try {
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
        if (!conversation) {
            res.status(404).json({ message: "WhatsApp conversation not found." });
            return;
        }
        const messages = await WhatsAppMessage_1.default.find({ conversationId: conversation._id })
            .sort({ providerTimestamp: 1, createdAt: 1 })
            .limit(500)
            .lean();
        const latestInbound = [...messages]
            .reverse()
            .find((message) => message.direction === "inbound");
        conversation.unreadCount = 0;
        await conversation.save();
        if (latestInbound === null || latestInbound === void 0 ? void 0 : latestInbound.providerMessageId) {
            void (0, whatsAppService_1.markWhatsAppMessageRead)(latestInbound.providerMessageId);
        }
        res.status(200).json({
            configured: (0, whatsAppService_1.getWhatsAppConfiguration)().configured,
            conversation,
            messages,
        });
    }
    catch {
        res.status(500).json({ message: "Failed to fetch WhatsApp conversation." });
    }
};
exports.getWhatsAppConversation = getWhatsAppConversation;
const claimWhatsAppConversation = async (req, res) => {
    try {
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
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
        if (!conversation.assignedToEmail)
            assignToCurrentUser(conversation, req);
        await conversation.save();
        res.status(200).json({ message: "Conversation assigned.", conversation });
    }
    catch {
        res.status(500).json({ message: "Failed to assign WhatsApp conversation." });
    }
};
exports.claimWhatsAppConversation = claimWhatsAppConversation;
const releaseWhatsAppConversation = async (req, res) => {
    try {
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
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
    }
    catch {
        res.status(500).json({ message: "Failed to release WhatsApp conversation." });
    }
};
exports.releaseWhatsAppConversation = releaseWhatsAppConversation;
const updateWhatsAppConversationStatus = async (req, res) => {
    var _a;
    try {
        const status = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || "");
        if (!conversationStatuses.includes(status)) {
            res.status(400).json({ message: "Invalid WhatsApp conversation status." });
            return;
        }
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
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
    }
    catch {
        res.status(500).json({ message: "Failed to update WhatsApp status." });
    }
};
exports.updateWhatsAppConversationStatus = updateWhatsAppConversationStatus;
const addWhatsAppConversationNote = async (req, res) => {
    var _a;
    try {
        const note = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.note) || "").trim();
        if (!note || note.length > 2000) {
            res.status(400).json({ message: "A note of 1 to 2000 characters is required." });
            return;
        }
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
        if (!conversation) {
            res.status(404).json({ message: "WhatsApp conversation not found." });
            return;
        }
        addActivity(conversation, req, "note", note);
        await conversation.save();
        res.status(200).json({ message: "Internal note added.", conversation });
    }
    catch {
        res.status(500).json({ message: "Failed to add internal note." });
    }
};
exports.addWhatsAppConversationNote = addWhatsAppConversationNote;
const replyToWhatsAppConversation = async (req, res) => {
    var _a;
    try {
        let text;
        try {
            text = (0, whatsAppPolicy_1.validateWhatsAppText)((_a = req.body) === null || _a === void 0 ? void 0 : _a.message);
        }
        catch (error) {
            res.status(400).json({ message: error instanceof Error ? error.message : "Invalid message." });
            return;
        }
        const conversation = await WhatsAppConversation_1.default.findById(req.params.id);
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
        if (!(0, whatsAppPolicy_1.isWhatsAppServiceWindowOpen)(conversation.serviceWindowExpiresAt)) {
            res.status(409).json({
                code: "WHATSAPP_SERVICE_WINDOW_CLOSED",
                message: "The 24-hour WhatsApp service window is closed. Use an approved Meta template before sending another free-form message.",
            });
            return;
        }
        if (!conversation.assignedToEmail)
            assignToCurrentUser(conversation, req);
        const now = new Date();
        const message = await WhatsAppMessage_1.default.create({
            conversationId: conversation._id,
            providerMessageId: `local:${crypto_1.default.randomUUID()}`,
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
            const sent = await (0, whatsAppService_1.sendWhatsAppTextMessage)(conversation.waId, text);
            message.providerMessageId = sent.providerMessageId;
            message.status = "sent";
            await message.save();
        }
        catch (error) {
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
    }
    catch (error) {
        res.status(502).json({
            message: error instanceof Error ? error.message : "Failed to send WhatsApp reply.",
        });
    }
};
exports.replyToWhatsAppConversation = replyToWhatsAppConversation;

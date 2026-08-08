"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmail = exports.updateEmailStatus = exports.forwardEmail = exports.replyToEmail = exports.deleteOutboundEmail = exports.sendDraftEmail = exports.sendComposedEmail = exports.updateDraftEmail = exports.saveDraftEmail = exports.releaseEmail = exports.claimEmail = exports.getEmail = exports.getOutboundEmails = exports.getEmails = exports.getEmailSummary = exports.cronSyncEmails = exports.syncEmails = void 0;
const EmailMessage_1 = __importDefault(require("../models/EmailMessage"));
const OutboundEmail_1 = __importDefault(require("../models/OutboundEmail"));
const User_1 = __importDefault(require("../models/User"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const emailSyncService_1 = require("../services/emailSyncService");
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const emailTemplate_1 = require("../utils/emailTemplate");
const emailFilters_1 = require("../utils/emailFilters");
const allowedStatuses = ["new", "read", "replied", "archived"];
const MAX_ATTACHMENT_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 8;
const normalizeReplySubject = (subject) => /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim() || "Your message"}`;
const normalizeForwardSubject = (subject) => /^(fw|fwd):/i.test(subject.trim()) ? subject.trim() : `Fwd: ${subject.trim() || "Forwarded message"}`;
const applyInboundFolderFilter = (filter, folder) => {
    if (folder === emailFilters_1.SPAM_FOLDER || folder === "dmarc") {
        filter.folder = { $in: [emailFilters_1.SPAM_FOLDER, "dmarc"] };
        return;
    }
    filter.$and = [
        ...(filter.$and || []),
        {
            $or: [
                { folder: "inbox" },
                { folder: { $exists: false } },
                { folder: "" },
            ],
        },
    ];
};
const parseQueryValues = (value) => String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const parseEmailList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
    }
    return String(value || "")
        .split(/[,\n;]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
};
const getAdminName = (req) => { var _a, _b; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.name) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || "Admin"; };
const getAdminEmail = (req) => { var _a; return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || "").toLowerCase().trim(); };
const isCpMailbox = (email = "") => /^[-a-z0-9._%+]+@creativapoeta\.(com|be)$/i.test(email.trim());
const SHARED_MAILBOXES = ["contact@creativapoeta.com", "contact@creativapoeta.be"];
const SHARED_SENDER_MAILBOXES = new Set([
    ...SHARED_MAILBOXES,
    "info@creativapoeta.com",
    "info@creativapoeta.be",
    "noreply@creativapoeta.com",
    "noreply@creativapoeta.be",
]);
const getSenderDisplayName = (req, fromEmail) => {
    const sender = normalizeEmail(fromEmail);
    if (!sender || SHARED_SENDER_MAILBOXES.has(sender))
        return "Creativa Poeta";
    const adminName = String(getAdminName(req) || "").trim();
    if (!adminName || adminName.toLowerCase() === sender || adminName.toLowerCase() === "admin") {
        return "Creativa Poeta Team";
    }
    return `${adminName} from Creativa Poeta`;
};
const enrichEmailOwnerRoles = async (emails) => {
    const rows = emails.map((email) => typeof (email === null || email === void 0 ? void 0 : email.toObject) === "function" ? email.toObject() : { ...email });
    const ownerEmails = Array.from(new Set(rows.map((email) => normalizeEmail(email.assignedToEmail)).filter(Boolean)));
    if (!ownerEmails.length)
        return rows;
    const owners = await User_1.default.find({ email: { $in: ownerEmails } }).select("email role").lean();
    const roleByEmail = new Map(owners.map((owner) => [normalizeEmail(owner.email), owner.role]));
    return rows.map((email) => ({
        ...email,
        assignedToRole: roleByEmail.get(normalizeEmail(email.assignedToEmail)),
    }));
};
const enrichEmailOwnerRole = async (email) => (await enrichEmailOwnerRoles([email]))[0];
const canManageSharedMailboxes = (req) => { var _a, _b; return ["super_admin", "admin_0"].includes((0, authMiddleware_1.getEffectiveAdminRole)((_a = req.user) === null || _a === void 0 ? void 0 : _a.role, (_b = req.user) === null || _b === void 0 ? void 0 : _b.email)); };
const getAllowedMailboxAddresses = async (req) => {
    var _a, _b;
    const currentEmail = getAdminEmail(req);
    const currentUserId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.id);
    const user = currentUserId
        ? await User_1.default.findById(currentUserId).select("email mailboxAccess role isActive accountStatus")
        : await User_1.default.findOne({ email: currentEmail }).select("email mailboxAccess role isActive accountStatus");
    const personalMailboxRows = await User_1.default.find({}).select("email").lean();
    const reservedPersonalMailboxes = new Set(personalMailboxRows
        .map((row) => normalizeEmail(row.email))
        .filter((address) => address && address !== currentEmail));
    const addresses = new Set();
    if (currentEmail)
        addresses.add(currentEmail);
    if (user === null || user === void 0 ? void 0 : user.email)
        addresses.add(String(user.email).toLowerCase().trim());
    ((user === null || user === void 0 ? void 0 : user.mailboxAccess) || []).forEach((mailbox) => {
        const address = String(mailbox.address || "").toLowerCase().trim();
        if (!address)
            return;
        if (mailbox.type === "personal" && address !== currentEmail)
            return;
        if (reservedPersonalMailboxes.has(address))
            return;
        addresses.add(address);
    });
    if (canManageSharedMailboxes(req)) {
        SHARED_MAILBOXES.forEach((address) => addresses.add(address));
        const sharedRows = await User_1.default.find({ "mailboxAccess.type": "shared" })
            .select("mailboxAccess")
            .lean();
        sharedRows.forEach((row) => {
            (row.mailboxAccess || []).forEach((mailbox) => {
                if (mailbox.type === "shared" && mailbox.address) {
                    const address = String(mailbox.address).toLowerCase().trim();
                    if (!reservedPersonalMailboxes.has(address))
                        addresses.add(address);
                }
            });
        });
    }
    return Array.from(addresses).filter(Boolean);
};
const applyInboundMailboxAccess = async (req, filter) => {
    const allowedAddresses = await getAllowedMailboxAddresses(req);
    filter.$and = [
        ...(filter.$and || []),
        {
            $or: [{ mailboxAddress: { $in: allowedAddresses } }, { mailbox: { $in: allowedAddresses } }],
        },
    ];
};
const applyOutboundOwnerAccess = (req, filter) => {
    filter.createdByEmail = getAdminEmail(req);
};
const applyOutboundReadAccess = async (req, filter, folder) => {
    if (folder === "draft") {
        applyOutboundOwnerAccess(req, filter);
        return;
    }
    const currentEmail = getAdminEmail(req);
    const allowedAddresses = await getAllowedMailboxAddresses(req);
    filter.$and = [
        ...(filter.$and || []),
        {
            $or: [
                { createdByEmail: currentEmail },
                { fromEmail: { $in: allowedAddresses } },
            ],
        },
    ];
};
const addEmailActivity = (email, req, type, message) => {
    email.activity = email.activity || [];
    email.activity.push({
        type,
        actorName: getAdminName(req),
        actorEmail: getAdminEmail(req),
        message,
        createdAt: new Date(),
    });
};
const assignEmailToCurrentUser = (email, req, message = "Ticket pris en charge") => {
    email.assignedToEmail = getAdminEmail(req);
    email.assignedToName = getAdminName(req);
    email.assignedAt = new Date();
    addEmailActivity(email, req, "assigned", message);
};
const canModifyEmailAssignment = (req, email) => canManageSharedMailboxes(req) || !email.assignedToEmail || email.assignedToEmail === getAdminEmail(req);
const getAdminNotificationEmail = () => process.env.ADMIN_NOTIFICATION_EMAIL ||
    process.env.ADMIN_EMAIL ||
    process.env.EMAIL_USER ||
    "creativapoeta@gmail.com";
const isValidCronToken = (req) => {
    const expected = process.env.EMAIL_SYNC_CRON_TOKEN;
    if (!expected)
        return false;
    const authorization = String(req.headers.authorization || "");
    const bearerToken = authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
    const headerToken = String(req.headers["x-cron-token"] || "");
    const queryToken = String(req.query.token || "");
    return [bearerToken, headerToken, queryToken].some((token) => token && token === expected);
};
const notifyAdminAboutNewEmails = async (syncStartedAt, importedCount) => {
    if (importedCount <= 0)
        return;
    const inboxFolderFilter = {};
    applyInboundFolderFilter(inboxFolderFilter, "inbox");
    const newEmails = await EmailMessage_1.default.find({ createdAt: { $gte: syncStartedAt }, ...inboxFolderFilter })
        .sort({ receivedAt: -1 })
        .limit(8);
    if (!newEmails.length)
        return;
    const rows = newEmails
        .map((email) => {
        const sender = email.fromName
            ? `${(0, emailTemplate_1.escapeHtml)(email.fromName)} &lt;${(0, emailTemplate_1.escapeHtml)(email.fromEmail || "")}&gt;`
            : (0, emailTemplate_1.escapeHtml)(email.fromEmail || "Expediteur inconnu");
        return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5edf7;">
            <strong>${(0, emailTemplate_1.escapeHtml)(email.subject || "(Sans sujet)")}</strong><br />
            <span style="color:#64748b;font-size:13px;">${sender}</span><br />
            <span style="color:#64748b;font-size:13px;">Boite: ${(0, emailTemplate_1.escapeHtml)(email.mailboxAddress || email.mailbox)}</span>
          </td>
        </tr>
      `;
    })
        .join("");
    const adminUrl = process.env.ADMIN_EMAILS_URL ||
        process.env.FRONTEND_ADMIN_EMAILS_URL ||
        "https://creativapoeta.com/secure-admin-dashboard-2024/emails";
    const content = `
    <p>Un ou plusieurs nouveaux emails viennent d'etre importes dans CP Mail.</p>
    <p><strong>${importedCount}</strong> nouveau(x) message(s) detecte(s).</p>
    ${rows
        ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;">${rows}</table>`
        : ""}
    <p>
      <a href="${(0, emailTemplate_1.escapeHtml)(adminUrl)}" style="display:inline-block;background:#f2b705;color:#071a33;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:999px;">
        Ouvrir CP Mail
      </a>
    </p>
  `;
    await (0, sendEmail_1.default)(getAdminNotificationEmail(), "Nouveau mail recu dans CP Mail", content, {
        title: "Nouveau mail recu dans CP Mail",
        preheader: `${newEmails.length} nouveau(x) message(s) dans Creativa Poeta Mail.`,
        replyTo: process.env.REPLY_TO_EMAIL || process.env.SMTP_FROM_EMAIL || "contact@creativapoeta.com",
    });
};
const getOutboundPayload = (req) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return ({
        to: parseEmailList((_a = req.body) === null || _a === void 0 ? void 0 : _a.to),
        cc: parseEmailList((_b = req.body) === null || _b === void 0 ? void 0 : _b.cc),
        bcc: parseEmailList((_c = req.body) === null || _c === void 0 ? void 0 : _c.bcc),
        subject: String(((_d = req.body) === null || _d === void 0 ? void 0 : _d.subject) || "").trim(),
        body: String(((_e = req.body) === null || _e === void 0 ? void 0 : _e.body) || "").trim(),
        signature: String(((_f = req.body) === null || _f === void 0 ? void 0 : _f.signature) || "").trim(),
        fromEmail: normalizeEmail(((_g = req.body) === null || _g === void 0 ? void 0 : _g.fromEmail) || ((_h = req.body) === null || _h === void 0 ? void 0 : _h.from) || ""),
    });
};
const getUploadedFiles = (req) => Array.isArray(req.files) ? req.files : [];
const getUploadedAttachments = (req) => {
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
const sendOutboundPayload = async (payload, req) => {
    if (!payload.to.length)
        throw new Error("At least one recipient is required.");
    if (!payload.subject)
        throw new Error("Subject is required.");
    if (!payload.body)
        throw new Error("Message body is required.");
    const { mailAttachments, metadata } = getUploadedAttachments(req);
    if (payload.fromEmail && !isCpMailbox(payload.fromEmail)) {
        throw new Error("Sender must be a Creativa Poeta mailbox.");
    }
    const allowedSenders = await getAllowedMailboxAddresses(req);
    if (payload.fromEmail && allowedSenders && !allowedSenders.includes(payload.fromEmail)) {
        throw new Error("You cannot send from this mailbox.");
    }
    await (0, sendEmail_1.default)(payload.to, payload.subject, (0, emailTemplate_1.formatParagraphs)(payload.body), {
        cc: payload.cc,
        bcc: payload.bcc,
        fromEmail: payload.fromEmail || undefined,
        fromName: getSenderDisplayName(req, payload.fromEmail),
        replyTo: payload.fromEmail || undefined,
        title: payload.subject,
        preheader: payload.body.slice(0, 130),
        signature: payload.signature,
        wrap: false,
        attachments: mailAttachments,
    });
    return {
        ...payload,
        folder: "sent",
        status: "sent",
        fromEmail: payload.fromEmail || undefined,
        attachments: metadata,
        sentAt: new Date(),
        updatedBy: getAdminName(req),
    };
};
const syncEmails = async (req, res) => {
    var _a;
    try {
        const limit = Number(((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || req.query.limit || 50);
        const result = await (0, emailSyncService_1.syncConfiguredMailboxes)(limit);
        const filteredSpamMessages = await EmailMessage_1.default.updateMany({
            folder: { $ne: emailFilters_1.SPAM_FOLDER },
            ...emailFilters_1.spamMessageMongoFilter,
        }, { $set: { folder: emailFilters_1.SPAM_FOLDER, status: "read" } });
        res.status(200).json({
            message: "Email sync completed",
            ...result,
            filteredSpamMessages: filteredSpamMessages.modifiedCount || 0,
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to sync emails",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.syncEmails = syncEmails;
const cronSyncEmails = async (req, res) => {
    var _a;
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
        const limit = Number(((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || req.query.limit || 50);
        const syncStartedAt = new Date();
        const result = await (0, emailSyncService_1.syncConfiguredMailboxes)(limit);
        try {
            await notifyAdminAboutNewEmails(syncStartedAt, result.imported);
        }
        catch (notificationError) {
            console.error("Email sync notification failed:", notificationError);
        }
        res.status(200).json({
            message: "Email cron sync completed",
            ...result,
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to run email cron sync",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.cronSyncEmails = cronSyncEmails;
const getEmailSummary = async (req, res) => {
    try {
        const filter = {};
        applyInboundFolderFilter(filter, "inbox");
        await applyInboundMailboxAccess(req, filter);
        const currentEmail = getAdminEmail(req);
        const [statusCounts, assignedToMe, openAssignedToOthers] = await Promise.all([
            EmailMessage_1.default.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
            currentEmail ? EmailMessage_1.default.countDocuments({ ...filter, assignedToEmail: currentEmail, status: { $ne: "archived" } }) : 0,
            EmailMessage_1.default.countDocuments({
                ...filter,
                assignedToEmail: { $exists: true, $nin: [currentEmail, ""] },
                status: { $in: ["new", "read", "replied"] },
            }),
        ]);
        const metrics = statusCounts.reduce((acc, item) => {
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
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to fetch email summary",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.getEmailSummary = getEmailSummary;
const getEmails = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
        const status = String(req.query.status || "all");
        const mailbox = String(req.query.mailbox || "all");
        const folder = String(req.query.folder || "inbox").toLowerCase();
        const search = String(req.query.search || "").trim();
        const filter = {};
        applyInboundFolderFilter(filter, folder);
        const selectedStatuses = parseQueryValues(status).filter((item) => allowedStatuses.includes(item));
        const selectedMailboxes = parseQueryValues(mailbox).filter((item) => item && item !== "all");
        if (selectedStatuses.length)
            filter.status = { $in: selectedStatuses };
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
        const mailboxAccessFilter = {};
        await applyInboundMailboxAccess(req, mailboxAccessFilter);
        const [emails, totalEmails, counts, mailboxRows] = await Promise.all([
            EmailMessage_1.default.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit).lean(),
            EmailMessage_1.default.countDocuments(filter),
            EmailMessage_1.default.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
            EmailMessage_1.default.aggregate([
                { $match: mailboxAccessFilter },
                { $group: { _id: "$mailboxAddress" } },
                { $sort: { _id: 1 } },
            ]),
        ]);
        const syncedMailboxes = mailboxRows.map((row) => row._id).filter(Boolean);
        const allowedMailboxAddresses = await getAllowedMailboxAddresses(req);
        const mailboxOptions = allowedMailboxAddresses
            ? Array.from(new Set([...allowedMailboxAddresses, ...syncedMailboxes])).sort()
            : syncedMailboxes;
        const emailsWithOwnerRoles = await enrichEmailOwnerRoles(emails);
        res.status(200).json({
            message: "Emails fetched successfully",
            emails: emailsWithOwnerRoles,
            mailboxes: mailboxOptions,
            metrics: counts.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalEmails / limit) || 1,
                totalEmails,
                limit,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to fetch emails",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.getEmails = getEmails;
const getOutboundEmails = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(Number(req.query.limit || 25), 100));
        const folder = req.query.folder === "sent" ? "sent" : "draft";
        const search = String(req.query.search || "").trim();
        const filter = { folder };
        await applyOutboundReadAccess(req, filter, folder);
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
            OutboundEmail_1.default.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
            OutboundEmail_1.default.countDocuments(filter),
            OutboundEmail_1.default.aggregate([{ $match: filter }, { $group: { _id: "$folder", count: { $sum: 1 } } }]),
        ]);
        res.status(200).json({
            message: "Outbound emails fetched successfully",
            emails,
            metrics: counts.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalEmails / limit) || 1,
                totalEmails,
                limit,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to fetch outbound emails",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.getOutboundEmails = getOutboundEmails;
const getEmail = async (req, res) => {
    try {
        const filter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, filter);
        const email = await EmailMessage_1.default.findOne(filter);
        if (!email) {
            res.status(404).json({ message: "Email not found" });
            return;
        }
        if (email.status === "new") {
            email.status = "read";
            addEmailActivity(email, req, "read", "Message ouvert");
            await email.save();
            if (await (0, emailSyncService_1.setMessageSeenOnServer)(email, true)) {
                email.isSeenOnServer = true;
                await email.save();
            }
        }
        res.status(200).json({ message: "Email fetched successfully", email: await enrichEmailOwnerRole(email) });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to fetch email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.getEmail = getEmail;
const claimEmail = async (req, res) => {
    try {
        const filter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, filter);
        const email = await EmailMessage_1.default.findOne(filter);
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
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to assign email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.claimEmail = claimEmail;
const releaseEmail = async (req, res) => {
    try {
        const filter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, filter);
        const email = await EmailMessage_1.default.findOne(filter);
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
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to release email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.releaseEmail = releaseEmail;
const saveDraftEmail = async (req, res) => {
    try {
        const payload = getOutboundPayload(req);
        const email = await OutboundEmail_1.default.create({
            ...payload,
            folder: "draft",
            status: "draft",
            createdBy: getAdminName(req),
            updatedBy: getAdminName(req),
            createdByEmail: getAdminEmail(req),
            updatedByEmail: getAdminEmail(req),
        });
        res.status(201).json({ message: "Draft saved", email });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to save draft",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.saveDraftEmail = saveDraftEmail;
const updateDraftEmail = async (req, res) => {
    try {
        const payload = getOutboundPayload(req);
        const draftFilter = { _id: req.params.id, folder: "draft" };
        applyOutboundOwnerAccess(req, draftFilter);
        const email = await OutboundEmail_1.default.findOneAndUpdate(draftFilter, { ...payload, updatedBy: getAdminName(req), updatedByEmail: getAdminEmail(req) }, { new: true });
        if (!email) {
            res.status(404).json({ message: "Draft not found" });
            return;
        }
        res.status(200).json({ message: "Draft updated", email });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to update draft",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.updateDraftEmail = updateDraftEmail;
const sendComposedEmail = async (req, res) => {
    var _a;
    try {
        const payload = getOutboundPayload(req);
        const sentPayload = await sendOutboundPayload(payload, req);
        const draftId = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.draftId) || "").trim();
        const email = draftId
            ? await OutboundEmail_1.default.findOneAndUpdate({ _id: draftId, createdByEmail: getAdminEmail(req) }, sentPayload, { new: true })
            : await OutboundEmail_1.default.create({ ...sentPayload, createdBy: getAdminName(req), createdByEmail: getAdminEmail(req) });
        res.status(200).json({ message: "Email sent", email });
    }
    catch (error) {
        res.status(400).json({
            message: "Failed to send email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.sendComposedEmail = sendComposedEmail;
const sendDraftEmail = async (req, res) => {
    try {
        const draftFilter = { _id: req.params.id, folder: "draft" };
        applyOutboundOwnerAccess(req, draftFilter);
        const draft = await OutboundEmail_1.default.findOne(draftFilter);
        if (!draft) {
            res.status(404).json({ message: "Draft not found" });
            return;
        }
        try {
            const sentPayload = await sendOutboundPayload({
                to: draft.to || [],
                cc: draft.cc || [],
                bcc: draft.bcc || [],
                subject: draft.subject || "",
                body: draft.body || "",
                signature: draft.signature || "",
                fromEmail: draft.fromEmail || "",
            }, req);
            Object.assign(draft, sentPayload);
            await draft.save();
            res.status(200).json({ message: "Draft sent", email: draft });
        }
        catch (sendError) {
            draft.status = "failed";
            draft.error = (sendError === null || sendError === void 0 ? void 0 : sendError.message) || "Unknown error";
            draft.updatedBy = getAdminName(req);
            draft.updatedByEmail = getAdminEmail(req);
            await draft.save();
            res.status(400).json({
                message: "Failed to send draft",
                error: draft.error,
                email: draft,
            });
        }
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to send draft",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.sendDraftEmail = sendDraftEmail;
const deleteOutboundEmail = async (req, res) => {
    try {
        const outboundDeleteFilter = { _id: req.params.id };
        applyOutboundOwnerAccess(req, outboundDeleteFilter);
        const email = await OutboundEmail_1.default.findOneAndDelete(outboundDeleteFilter);
        if (!email) {
            res.status(404).json({ message: "Outbound email not found" });
            return;
        }
        res.status(200).json({ message: "Email deleted" });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to delete outbound email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.deleteOutboundEmail = deleteOutboundEmail;
const replyToEmail = async (req, res) => {
    try {
        const { replyMessage, subject, signature } = req.body;
        if (!replyMessage || !String(replyMessage).trim()) {
            res.status(400).json({ message: "Reply message is required" });
            return;
        }
        const filter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, filter);
        const email = await EmailMessage_1.default.findOne(filter);
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
      ${(0, emailTemplate_1.formatParagraphs)(cleanMessage)}
      ${(0, emailTemplate_1.renderQuotedEmailBlock)({
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
        await (0, sendEmail_1.default)(email.fromEmail, replySubject, content, {
            fromEmail: replyFromEmail,
            fromName: getSenderDisplayName(req, replyFromEmail),
            replyTo: replyFromEmail,
            title: replySubject,
            preheader: cleanMessage.slice(0, 130),
            signature: String(signature || "").trim(),
            wrap: false,
        });
        await OutboundEmail_1.default.create({
            to: [email.fromEmail],
            cc: [],
            bcc: [],
            subject: replySubject,
            body: cleanMessage,
            signature: String(signature || "").trim(),
            fromEmail: replyFromEmail,
            folder: "sent",
            status: "sent",
            sentAt: new Date(),
            createdBy: getAdminName(req),
            createdByEmail: getAdminEmail(req),
            updatedBy: getAdminName(req),
            updatedByEmail: getAdminEmail(req),
        });
        if (!email.assignedToEmail) {
            assignEmailToCurrentUser(email, req, "Ticket assigned during reply");
        }
        else if (email.assignedToEmail !== getAdminEmail(req)) {
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
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to send email reply",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.replyToEmail = replyToEmail;
const forwardEmail = async (req, res) => {
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
        const filter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, filter);
        const email = await EmailMessage_1.default.findOne(filter);
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
      ${(0, emailTemplate_1.formatParagraphs)(cleanMessage)}
      ${(0, emailTemplate_1.renderQuotedEmailBlock)({
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
        await (0, sendEmail_1.default)(payload.to, forwardSubject, content, {
            cc: payload.cc,
            bcc: payload.bcc,
            fromEmail: payload.fromEmail || undefined,
            fromName: getSenderDisplayName(req, payload.fromEmail),
            replyTo: payload.fromEmail || undefined,
            title: forwardSubject,
            preheader: cleanMessage.slice(0, 130),
            signature: payload.signature,
            wrap: false,
            attachments: mailAttachments,
        });
        const outbound = await OutboundEmail_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to forward email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.forwardEmail = forwardEmail;
const updateEmailStatus = async (req, res) => {
    var _a;
    try {
        const status = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || "");
        if (!allowedStatuses.includes(status)) {
            res.status(400).json({ message: "Invalid email status" });
            return;
        }
        const statusFilter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, statusFilter);
        const email = await EmailMessage_1.default.findOne(statusFilter);
        if (!email) {
            res.status(404).json({ message: "Email not found" });
            return;
        }
        if (email.status !== status) {
            email.status = status;
            addEmailActivity(email, req, "status", `Status changed to ${status}`);
            await email.save();
        }
        const shouldBeSeenOnServer = status !== "new";
        if (email.isSeenOnServer !== shouldBeSeenOnServer &&
            (await (0, emailSyncService_1.setMessageSeenOnServer)(email, shouldBeSeenOnServer))) {
            email.isSeenOnServer = shouldBeSeenOnServer;
            await email.save();
        }
        res.status(200).json({ message: "Email status updated", email: await enrichEmailOwnerRole(email) });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to update email status",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.updateEmailStatus = updateEmailStatus;
const deleteEmail = async (req, res) => {
    try {
        const deleteFilter = { _id: req.params.id };
        await applyInboundMailboxAccess(req, deleteFilter);
        const email = await EmailMessage_1.default.findOneAndDelete(deleteFilter);
        if (!email) {
            res.status(404).json({ message: "Email not found" });
            return;
        }
        res.status(200).json({ message: "Email deleted from dashboard copy" });
    }
    catch (error) {
        res.status(500).json({
            message: "Failed to delete email",
            error: (error === null || error === void 0 ? void 0 : error.message) || "Unknown error",
        });
    }
};
exports.deleteEmail = deleteEmail;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveAdminNotification = exports.resolvePasswordResetNotification = exports.markAdminNotificationRead = exports.getAdminNotificationSummary = exports.listAdminNotifications = void 0;
const crypto_1 = __importDefault(require("crypto"));
const User_1 = __importDefault(require("../models/User"));
const AdminNotification_1 = __importDefault(require("../models/AdminNotification"));
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://creativapoeta.com").replace(/\/$/, "");
const createPlainToken = () => crypto_1.default.randomBytes(32).toString("hex");
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const buildResetLink = (email, token) => `${FRONTEND_URL}/secure-admin-login-2024?resetToken=${token}&email=${encodeURIComponent(email)}`;
const sanitizeNotification = (notification) => ({
    id: notification._id,
    _id: notification._id,
    type: notification.type,
    status: notification.status,
    title: notification.title,
    message: notification.message,
    targetEmail: notification.targetEmail,
    targetName: notification.targetName,
    resolvedByEmail: notification.resolvedByEmail,
    resolvedByName: notification.resolvedByName,
    resolvedAt: notification.resolvedAt,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
});
const listAdminNotifications = async (req, res) => {
    try {
        const status = String(req.query.status || "active");
        const filter = status === "all"
            ? {}
            : status === "resolved"
                ? { status: "resolved" }
                : { status: { $in: ["new", "read"] } };
        const notifications = await AdminNotification_1.default.find(filter).sort({ createdAt: -1 }).limit(100);
        res.status(200).json({ notifications: notifications.map(sanitizeNotification) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.listAdminNotifications = listAdminNotifications;
const getAdminNotificationSummary = async (_req, res) => {
    try {
        const [newCount, openCount] = await Promise.all([
            AdminNotification_1.default.countDocuments({ status: "new" }),
            AdminNotification_1.default.countDocuments({ status: { $in: ["new", "read"] } }),
        ]);
        res.status(200).json({ metrics: { new: newCount, open: openCount } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getAdminNotificationSummary = getAdminNotificationSummary;
const markAdminNotificationRead = async (req, res) => {
    try {
        const notification = await AdminNotification_1.default.findById(req.params.id);
        if (!notification) {
            res.status(404).json({ error: "Notification not found." });
            return;
        }
        if (notification.status === "new") {
            notification.status = "read";
            await notification.save();
        }
        res.status(200).json({ notification: sanitizeNotification(notification) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.markAdminNotificationRead = markAdminNotificationRead;
const resolvePasswordResetNotification = async (req, res) => {
    var _a, _b;
    try {
        const notification = await AdminNotification_1.default.findById(req.params.id);
        if (!notification || notification.type !== "password_reset") {
            res.status(404).json({ error: "Password reset request not found." });
            return;
        }
        const user = notification.targetUserId
            ? await User_1.default.findById(notification.targetUserId)
            : await User_1.default.findOne({ email: notification.targetEmail });
        if (!user || !user.isActive || user.accountStatus === "disabled") {
            res.status(404).json({ error: "Admin account not found or disabled." });
            return;
        }
        const token = createPlainToken();
        user.resetTokenHash = hashToken(token);
        user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();
        notification.status = "resolved";
        notification.resolvedByEmail = (_a = req.user) === null || _a === void 0 ? void 0 : _a.email;
        notification.resolvedByName = (_b = req.user) === null || _b === void 0 ? void 0 : _b.name;
        notification.resolvedAt = new Date();
        await notification.save();
        res.status(200).json({
            message: "Password reset link generated.",
            resetLink: buildResetLink(user.email, token),
            notification: sanitizeNotification(notification),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.resolvePasswordResetNotification = resolvePasswordResetNotification;
const archiveAdminNotification = async (req, res) => {
    try {
        const notification = await AdminNotification_1.default.findById(req.params.id);
        if (!notification) {
            res.status(404).json({ error: "Notification not found." });
            return;
        }
        notification.status = "archived";
        await notification.save();
        res.status(200).json({ notification: sanitizeNotification(notification) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.archiveAdminNotification = archiveAdminNotification;

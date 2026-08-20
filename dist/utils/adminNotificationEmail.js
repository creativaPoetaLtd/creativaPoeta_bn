"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAdminNotificationEmail = exports.getAdminNotificationEmail = void 0;
const sendEmail_1 = __importDefault(require("./sendEmail"));
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
/**
 * Administrative notifications must have an explicit destination.
 * EMAIL_USER is a transport credential/fallback sender and must never be
 * treated as the mailbox that owns operational notifications.
 */
const getAdminNotificationEmail = () => {
    const recipient = normalizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
    return isValidEmail(recipient) ? recipient : "";
};
exports.getAdminNotificationEmail = getAdminNotificationEmail;
const sendAdminNotificationEmail = async (subject, html, options) => {
    const recipient = (0, exports.getAdminNotificationEmail)();
    if (!recipient) {
        console.error("Administrative email not sent: ADMIN_NOTIFICATION_EMAIL is missing or invalid.");
        return false;
    }
    try {
        await (0, sendEmail_1.default)(recipient, subject, html, options);
        return true;
    }
    catch (error) {
        console.error("Administrative notification email failed:", error instanceof Error ? error.message : error);
        return false;
    }
};
exports.sendAdminNotificationEmail = sendAdminNotificationEmail;

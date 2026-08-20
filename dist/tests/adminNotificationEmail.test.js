"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const adminNotificationEmail_1 = require("../utils/adminNotificationEmail");
const originalAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
const originalTransportUser = process.env.EMAIL_USER;
(0, node_test_1.afterEach)(() => {
    if (originalAdminEmail === undefined)
        delete process.env.ADMIN_NOTIFICATION_EMAIL;
    else
        process.env.ADMIN_NOTIFICATION_EMAIL = originalAdminEmail;
    if (originalTransportUser === undefined)
        delete process.env.EMAIL_USER;
    else
        process.env.EMAIL_USER = originalTransportUser;
});
(0, node_test_1.test)("administrative notifications use the explicit configured recipient", () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = " Notifications@CreativaPoeta.com ";
    process.env.EMAIL_USER = "legacy-sender@example.com";
    strict_1.default.equal((0, adminNotificationEmail_1.getAdminNotificationEmail)(), "notifications@creativapoeta.com");
});
(0, node_test_1.test)("administrative notifications never fall back to EMAIL_USER", () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.EMAIL_USER = "former-team-member@example.com";
    strict_1.default.equal((0, adminNotificationEmail_1.getAdminNotificationEmail)(), "");
});
(0, node_test_1.test)("an invalid administrative recipient is rejected", () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = "not-an-email";
    strict_1.default.equal((0, adminNotificationEmail_1.getAdminNotificationEmail)(), "");
});

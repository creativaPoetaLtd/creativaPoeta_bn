"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const projectFormController_1 = require("../controllers/projectFormController");
const emailTemplate_1 = require("../utils/emailTemplate");
(0, node_test_1.default)("project replies contain only the administrator message inside the branded wrapper", () => {
    const reply = "Bonjour Deo,\n\nMerci pour votre demande. Nous revenons vers vous rapidement.";
    const content = (0, projectFormController_1.renderProjectReplyContent)(reply);
    const html = (0, emailTemplate_1.renderBrandedEmail)({ content });
    strict_1.default.match(html, /Creativa Poeta/);
    strict_1.default.match(html, /Bonjour Deo/);
    strict_1.default.match(html, /Merci pour votre demande/);
    strict_1.default.match(html, /Best regards/);
    strict_1.default.doesNotMatch(html, /Your Original Request Summary/);
    strict_1.default.doesNotMatch(html, /Our Response/);
    strict_1.default.doesNotMatch(html, /Reference ID/);
    strict_1.default.doesNotMatch(html, /We look forward to working with you/);
    strict_1.default.doesNotMatch(html, /response-section|original-request|email-container/);
});

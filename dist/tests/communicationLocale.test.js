"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const communicationLocale_1 = require("../utils/communicationLocale");
(0, node_test_1.default)("normalizes website locales and uses English as the safe fallback", () => {
    strict_1.default.equal((0, communicationLocale_1.normalizeCommunicationLocale)("fr-BE"), "fr");
    strict_1.default.equal((0, communicationLocale_1.normalizeCommunicationLocale)("nl_BE"), "nl");
    strict_1.default.equal((0, communicationLocale_1.normalizeCommunicationLocale)("kiny-RW"), "rw");
    strict_1.default.equal((0, communicationLocale_1.normalizeCommunicationLocale)(""), "en");
    strict_1.default.equal((0, communicationLocale_1.normalizeCommunicationLocale)("unsupported"), "en");
});
(0, node_test_1.default)("provides localized fallback subjects for manually written replies", () => {
    strict_1.default.match((0, communicationLocale_1.getContactReplySubject)("fr"), /Votre message/i);
    strict_1.default.match((0, communicationLocale_1.getPartnershipReplySubject)("nl"), /Partnerschap/i);
    strict_1.default.equal((0, communicationLocale_1.getContactReplySubject)(undefined), "Re: Your message to Creativa Poeta");
});

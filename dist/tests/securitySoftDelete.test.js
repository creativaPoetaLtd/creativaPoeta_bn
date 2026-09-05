"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const ReferralReward_1 = __importDefault(require("../models/ReferralReward"));
const WhatsAppConversation_1 = __importDefault(require("../models/WhatsAppConversation"));
const WhatsAppMessage_1 = __importDefault(require("../models/WhatsAppMessage"));
const Job_1 = __importDefault(require("../models/Job"));
const Blog_1 = __importDefault(require("../models/Blog"));
const trashController_1 = require("../controllers/trashController");
const databasePrivileges_1 = require("../security/databasePrivileges");
const authMiddleware_1 = require("../middleware/authMiddleware");
const hasPartialUniqueIndex = (model, name) => model.schema.indexes().some(([, options]) => options.name === name
    && options.unique === true
    && JSON.stringify(options.partialFilterExpression) === JSON.stringify({ isDeleted: false }));
(0, node_test_1.default)("protected models contain soft-delete metadata", () => {
    for (const model of [ReferralReward_1.default, WhatsAppConversation_1.default, WhatsAppMessage_1.default, Job_1.default]) {
        strict_1.default.ok(model.schema.path("isDeleted"), `${model.modelName} must be soft-delete protected`);
        strict_1.default.ok(model.schema.path("deletedAt"), `${model.modelName} must record deletion time`);
    }
});
(0, node_test_1.default)("protected models reject stale document saves", () => {
    for (const model of [ReferralReward_1.default, WhatsAppConversation_1.default, Job_1.default]) {
        strict_1.default.equal(model.schema.get("optimisticConcurrency"), true, `${model.modelName} must protect against lost concurrent updates`);
    }
});
(0, node_test_1.default)("protected models filter distinct queries and block full replacements", () => {
    const pres = Blog_1.default.schema.s.hooks._pres;
    strict_1.default.ok((pres.get("distinct") || []).length > 0, "distinct must exclude archived records");
    strict_1.default.ok((pres.get("replaceOne") || []).length > 0, "replaceOne must be blocked");
    strict_1.default.ok((pres.get("findOneAndReplace") || []).length > 0, "findOneAndReplace must be blocked");
});
(0, node_test_1.default)("active records use partial unique indexes", () => {
    strict_1.default.equal(hasPartialUniqueIndex(ReferralReward_1.default, "active_referral_reward_lead_unique"), true);
    strict_1.default.equal(hasPartialUniqueIndex(WhatsAppConversation_1.default, "active_whatsapp_conversation_key_unique"), true);
    strict_1.default.equal(hasPartialUniqueIndex(WhatsAppMessage_1.default, "active_whatsapp_provider_message_unique"), true);
});
(0, node_test_1.default)("rollback snapshots never restore secrets or unsafe payloads", () => {
    const cleaned = (0, trashController_1.cleanRollbackValue)({
        name: "Safe name",
        nested: { country: "Belgium", accessToken: "secret", passwordHash: "hash" },
        html: "<p>unsafe</p>",
        binary: "[binary:application/pdf]",
        redacted: "$redacted",
    });
    strict_1.default.equal(cleaned.name, "Safe name");
    strict_1.default.equal(cleaned.nested.country, "Belgium");
    strict_1.default.equal(cleaned.nested.accessToken, undefined);
    strict_1.default.equal(cleaned.nested.passwordHash, undefined);
    strict_1.default.equal(cleaned.html, undefined);
    strict_1.default.equal(cleaned.binary, undefined);
    strict_1.default.equal(cleaned.redacted, undefined);
});
(0, node_test_1.default)("rollback rejects truncated arrays instead of applying partial state", () => {
    strict_1.default.equal((0, trashController_1.cleanRollbackValue)(Array.from({ length: 250 }, (_, index) => index)), undefined);
});
(0, node_test_1.default)("runtime database role rejects deletion and database administration", () => {
    const dangerous = (0, databasePrivileges_1.findDestructiveRuntimePrivileges)([
        { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["find", "insert", "update"] },
        { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["remove", "dropDatabase"] },
    ]);
    strict_1.default.deepEqual(dangerous.map((entry) => entry.action), ["remove", "dropDatabase"]);
    strict_1.default.equal((0, databasePrivileges_1.findDestructiveRuntimePrivileges)([
        { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["find", "insert", "update"] },
    ]).length, 0);
});
(0, node_test_1.default)("root identity is derived server-side and remains an incognito authority", () => {
    strict_1.default.equal((0, authMiddleware_1.isRootAdminEmail)("ADMIN@CREATIVAPOETA.COM"), true);
    strict_1.default.equal((0, authMiddleware_1.getEffectiveAdminRole)("admin_5", "admin@creativapoeta.com"), "super_admin");
    strict_1.default.equal((0, authMiddleware_1.getEffectiveAdminRole)("admin_0", "visible.admin@creativapoeta.com"), "admin_0");
});

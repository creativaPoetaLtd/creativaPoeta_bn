import test from "node:test";
import assert from "node:assert/strict";
import ReferralReward from "../models/ReferralReward";
import WhatsAppConversation from "../models/WhatsAppConversation";
import WhatsAppMessage from "../models/WhatsAppMessage";
import Job from "../models/Job";
import Blog from "../models/Blog";
import { cleanRollbackValue } from "../controllers/trashController";
import { findDestructiveRuntimePrivileges } from "../security/databasePrivileges";
import { getEffectiveAdminRole, isRootAdminEmail } from "../middleware/authMiddleware";

const hasPartialUniqueIndex = (model: any, name: string) => model.schema.indexes().some(
  ([, options]: [Record<string, number>, Record<string, unknown>]) =>
    options.name === name
    && options.unique === true
    && JSON.stringify(options.partialFilterExpression) === JSON.stringify({ isDeleted: false })
);

test("protected models contain soft-delete metadata", () => {
  for (const model of [ReferralReward, WhatsAppConversation, WhatsAppMessage, Job]) {
    assert.ok((model.schema as any).path("isDeleted"), `${model.modelName} must be soft-delete protected`);
    assert.ok((model.schema as any).path("deletedAt"), `${model.modelName} must record deletion time`);
  }
});

test("protected models reject stale document saves", () => {
  for (const model of [ReferralReward, WhatsAppConversation, Job]) {
    assert.equal(
      model.schema.get("optimisticConcurrency"),
      true,
      `${model.modelName} must protect against lost concurrent updates`
    );
  }
});

test("protected models filter distinct queries and block full replacements", () => {
  const pres = (Blog.schema as any).s.hooks._pres as Map<string, unknown[]>;
  assert.ok((pres.get("distinct") || []).length > 0, "distinct must exclude archived records");
  assert.ok((pres.get("replaceOne") || []).length > 0, "replaceOne must be blocked");
  assert.ok((pres.get("findOneAndReplace") || []).length > 0, "findOneAndReplace must be blocked");
});

test("active records use partial unique indexes", () => {
  assert.equal(hasPartialUniqueIndex(ReferralReward, "active_referral_reward_lead_unique"), true);
  assert.equal(hasPartialUniqueIndex(WhatsAppConversation, "active_whatsapp_conversation_key_unique"), true);
  assert.equal(hasPartialUniqueIndex(WhatsAppMessage, "active_whatsapp_provider_message_unique"), true);
});

test("rollback snapshots never restore secrets or unsafe payloads", () => {
  const cleaned = cleanRollbackValue({
    name: "Safe name",
    nested: { country: "Belgium", accessToken: "secret", passwordHash: "hash" },
    html: "<p>unsafe</p>",
    binary: "[binary:application/pdf]",
    redacted: "$redacted",
  }) as Record<string, any>;

  assert.equal(cleaned.name, "Safe name");
  assert.equal(cleaned.nested.country, "Belgium");
  assert.equal(cleaned.nested.accessToken, undefined);
  assert.equal(cleaned.nested.passwordHash, undefined);
  assert.equal(cleaned.html, undefined);
  assert.equal(cleaned.binary, undefined);
  assert.equal(cleaned.redacted, undefined);
});

test("rollback rejects truncated arrays instead of applying partial state", () => {
  assert.equal(cleanRollbackValue(Array.from({ length: 250 }, (_, index) => index)), undefined);
});

test("runtime database role rejects deletion and database administration", () => {
  const dangerous = findDestructiveRuntimePrivileges([
    { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["find", "insert", "update"] },
    { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["remove", "dropDatabase"] },
  ]);
  assert.deepEqual(dangerous.map((entry) => entry.action), ["remove", "dropDatabase"]);
  assert.equal(findDestructiveRuntimePrivileges([
    { resource: { db: "creativaPoeta_db", collection: "" }, actions: ["find", "insert", "update"] },
  ]).length, 0);
});

test("root identity is derived server-side and remains an incognito authority", () => {
  assert.equal(isRootAdminEmail("ADMIN@CREATIVAPOETA.COM"), true);
  assert.equal(getEffectiveAdminRole("admin_5", "admin@creativapoeta.com"), "super_admin");
  assert.equal(getEffectiveAdminRole("admin_0", "visible.admin@creativapoeta.com"), "admin_0");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getContactReplySubject,
  getPartnershipReplySubject,
  normalizeCommunicationLocale,
} from "../utils/communicationLocale";

test("normalizes website locales and uses English as the safe fallback", () => {
  assert.equal(normalizeCommunicationLocale("fr-BE"), "fr");
  assert.equal(normalizeCommunicationLocale("nl_BE"), "nl");
  assert.equal(normalizeCommunicationLocale("kiny-RW"), "rw");
  assert.equal(normalizeCommunicationLocale(""), "en");
  assert.equal(normalizeCommunicationLocale("unsupported"), "en");
});

test("provides localized fallback subjects for manually written replies", () => {
  assert.match(getContactReplySubject("fr"), /Votre message/i);
  assert.match(getPartnershipReplySubject("nl"), /Partnerschap/i);
  assert.equal(
    getContactReplySubject(undefined),
    "Re: Your message to Creativa Poeta"
  );
});

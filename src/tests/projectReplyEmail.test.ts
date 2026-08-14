import assert from "node:assert/strict";
import test from "node:test";
import { renderProjectReplyContent } from "../controllers/projectFormController";
import { renderBrandedEmail } from "../utils/emailTemplate";

test("project replies contain only the administrator message inside the branded wrapper", () => {
  const reply = "Bonjour Deo,\n\nMerci pour votre demande. Nous revenons vers vous rapidement.";
  const content = renderProjectReplyContent(reply);
  const html = renderBrandedEmail({ content });

  assert.match(html, /Creativa Poeta/);
  assert.match(html, /Bonjour Deo/);
  assert.match(html, /Merci pour votre demande/);
  assert.match(html, /Best regards/);
  assert.doesNotMatch(html, /Your Original Request Summary/);
  assert.doesNotMatch(html, /Our Response/);
  assert.doesNotMatch(html, /Reference ID/);
  assert.doesNotMatch(html, /We look forward to working with you/);
  assert.doesNotMatch(html, /response-section|original-request|email-container/);
});

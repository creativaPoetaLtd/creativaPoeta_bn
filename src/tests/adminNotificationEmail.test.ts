import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getAdminNotificationEmail } from "../utils/adminNotificationEmail";

const originalAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
const originalTransportUser = process.env.EMAIL_USER;

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
  else process.env.ADMIN_NOTIFICATION_EMAIL = originalAdminEmail;

  if (originalTransportUser === undefined) delete process.env.EMAIL_USER;
  else process.env.EMAIL_USER = originalTransportUser;
});

test("administrative notifications use the explicit configured recipient", () => {
  process.env.ADMIN_NOTIFICATION_EMAIL = " Notifications@CreativaPoeta.com ";
  process.env.EMAIL_USER = "legacy-sender@example.com";

  assert.equal(getAdminNotificationEmail(), "notifications@creativapoeta.com");
});

test("administrative notifications never fall back to EMAIL_USER", () => {
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  process.env.EMAIL_USER = "former-team-member@example.com";

  assert.equal(getAdminNotificationEmail(), "");
});

test("an invalid administrative recipient is rejected", () => {
  process.env.ADMIN_NOTIFICATION_EMAIL = "not-an-email";

  assert.equal(getAdminNotificationEmail(), "");
});

import test from "node:test";
import assert from "node:assert/strict";
import { authenticator } from "otplib";
import {
  createMfaSetup,
  decryptMfaSecret,
  encryptMfaSecret,
  findRecoveryCodeIndex,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyMfaCode,
} from "../security/mfa";

test("MFA secrets are encrypted with authenticated, user-bound encryption", async () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY_BASE64;
  process.env.MFA_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
  try {
    const setup = await createMfaSetup("admin@example.com");
    const encrypted = encryptMfaSecret(setup.secret, "mfa-test-user");
    assert.notEqual(encrypted, setup.secret);
    assert.equal(decryptMfaSecret(encrypted, "mfa-test-user"), setup.secret);
    assert.throws(() => decryptMfaSecret(encrypted, "another-user"));
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY_BASE64;
    else process.env.MFA_ENCRYPTION_KEY_BASE64 = previousKey;
  }
});
test("TOTP codes and one-time recovery codes are validated safely", async () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY_BASE64;
  process.env.MFA_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 8).toString("base64");
  try {
    const setup = await createMfaSetup("admin@example.com");
    const token = authenticator.generate(setup.secret);
    assert.equal(await verifyMfaCode(setup.secret, token), true);
    assert.equal(await verifyMfaCode(setup.secret, "00000"), false);

    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    const hashes = codes.map((code) => hashRecoveryCode(code, "mfa-test-user"));
    assert.equal(findRecoveryCodeIndex(hashes, codes[3].toLowerCase(), "mfa-test-user"), 3);
    assert.equal(findRecoveryCodeIndex(hashes, "WRONG-CODE", "mfa-test-user"), -1);
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY_BASE64;
    else process.env.MFA_ENCRYPTION_KEY_BASE64 = previousKey;
  }
});

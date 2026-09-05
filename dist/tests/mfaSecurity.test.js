"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const otplib_1 = require("otplib");
const mfa_1 = require("../security/mfa");
(0, node_test_1.default)("MFA secrets are encrypted with authenticated, user-bound encryption", async () => {
    const previousKey = process.env.MFA_ENCRYPTION_KEY_BASE64;
    process.env.MFA_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
    try {
        const setup = await (0, mfa_1.createMfaSetup)("admin@example.com");
        const encrypted = (0, mfa_1.encryptMfaSecret)(setup.secret, "mfa-test-user");
        strict_1.default.notEqual(encrypted, setup.secret);
        strict_1.default.equal((0, mfa_1.decryptMfaSecret)(encrypted, "mfa-test-user"), setup.secret);
        strict_1.default.throws(() => (0, mfa_1.decryptMfaSecret)(encrypted, "another-user"));
    }
    finally {
        if (previousKey === undefined)
            delete process.env.MFA_ENCRYPTION_KEY_BASE64;
        else
            process.env.MFA_ENCRYPTION_KEY_BASE64 = previousKey;
    }
});
(0, node_test_1.default)("TOTP codes and one-time recovery codes are validated safely", async () => {
    const previousKey = process.env.MFA_ENCRYPTION_KEY_BASE64;
    process.env.MFA_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 8).toString("base64");
    try {
        const setup = await (0, mfa_1.createMfaSetup)("admin@example.com");
        const token = otplib_1.authenticator.generate(setup.secret);
        strict_1.default.equal(await (0, mfa_1.verifyMfaCode)(setup.secret, token), true);
        strict_1.default.equal(await (0, mfa_1.verifyMfaCode)(setup.secret, "00000"), false);
        const codes = (0, mfa_1.generateRecoveryCodes)();
        strict_1.default.equal(codes.length, 10);
        strict_1.default.equal(new Set(codes).size, 10);
        const hashes = codes.map((code) => (0, mfa_1.hashRecoveryCode)(code, "mfa-test-user"));
        strict_1.default.equal((0, mfa_1.findRecoveryCodeIndex)(hashes, codes[3].toLowerCase(), "mfa-test-user"), 3);
        strict_1.default.equal((0, mfa_1.findRecoveryCodeIndex)(hashes, "WRONG-CODE", "mfa-test-user"), -1);
    }
    finally {
        if (previousKey === undefined)
            delete process.env.MFA_ENCRYPTION_KEY_BASE64;
        else
            process.env.MFA_ENCRYPTION_KEY_BASE64 = previousKey;
    }
});

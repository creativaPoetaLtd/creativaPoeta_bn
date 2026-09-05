"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRecoveryCodeIndex = exports.hashRecoveryCode = exports.generateRecoveryCodes = exports.normalizeRecoveryCode = exports.verifyMfaCode = exports.createMfaSetup = exports.decryptMfaSecret = exports.encryptMfaSecret = void 0;
const crypto_1 = __importDefault(require("crypto"));
const qrcode_1 = __importDefault(require("qrcode"));
const otplib_1 = require("otplib");
const MFA_KEY_BYTES = 32;
const RECOVERY_CODE_COUNT = 10;
const getEncryptionKey = () => {
    const encoded = String(process.env.MFA_ENCRYPTION_KEY_BASE64 || "").trim();
    if (!encoded)
        throw new Error("MFA_ENCRYPTION_KEY_BASE64 is not configured.");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== MFA_KEY_BYTES) {
        throw new Error("MFA_ENCRYPTION_KEY_BASE64 must contain exactly 32 random bytes.");
    }
    return key;
};
const encryptMfaSecret = (secret, userId) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    cipher.setAAD(Buffer.from(userId, "utf8"));
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
};
exports.encryptMfaSecret = encryptMfaSecret;
const decryptMfaSecret = (payload, userId) => {
    const [version, ivValue, tagValue, encryptedValue] = String(payload || "").split(":");
    if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
        throw new Error("Stored MFA secret is invalid.");
    }
    const decipher = crypto_1.default.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivValue, "base64"));
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64")),
        decipher.final(),
    ]).toString("utf8");
};
exports.decryptMfaSecret = decryptMfaSecret;
const createMfaSetup = async (email) => {
    const secret = (0, otplib_1.generateSecret)({ length: 20 });
    const uri = (0, otplib_1.generateURI)({
        issuer: "Creativa Poeta",
        label: email,
        secret,
        digits: 6,
        period: 30,
    });
    return {
        secret,
        qrCodeDataUrl: await qrcode_1.default.toDataURL(uri, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 280,
        }),
    };
};
exports.createMfaSetup = createMfaSetup;
const verifyMfaCode = async (secret, token) => {
    const normalized = String(token || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalized))
        return false;
    const result = await (0, otplib_1.verify)({ secret, token: normalized, epochTolerance: 30 });
    return result.valid;
};
exports.verifyMfaCode = verifyMfaCode;
const normalizeRecoveryCode = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
exports.normalizeRecoveryCode = normalizeRecoveryCode;
const generateRecoveryCodes = () => Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto_1.default.randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
});
exports.generateRecoveryCodes = generateRecoveryCodes;
const hashRecoveryCode = (code, userId) => crypto_1.default
    .createHmac("sha256", getEncryptionKey())
    .update(`${userId}:${(0, exports.normalizeRecoveryCode)(code)}`)
    .digest("hex");
exports.hashRecoveryCode = hashRecoveryCode;
const findRecoveryCodeIndex = (hashes, code, userId) => {
    const candidate = Buffer.from((0, exports.hashRecoveryCode)(code, userId), "hex");
    return hashes.findIndex((hash) => {
        const stored = Buffer.from(hash, "hex");
        return stored.length === candidate.length && crypto_1.default.timingSafeEqual(stored, candidate);
    });
};
exports.findRecoveryCodeIndex = findRecoveryCodeIndex;

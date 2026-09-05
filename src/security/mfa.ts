import crypto from "crypto";
import QRCode from "qrcode";
import { authenticator } from "otplib";

const MFA_KEY_BYTES = 32;
const RECOVERY_CODE_COUNT = 10;

const getEncryptionKey = () => {
  const encoded = String(process.env.MFA_ENCRYPTION_KEY_BASE64 || "").trim();
  if (!encoded) throw new Error("MFA_ENCRYPTION_KEY_BASE64 is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== MFA_KEY_BYTES) {
    throw new Error("MFA_ENCRYPTION_KEY_BASE64 must contain exactly 32 random bytes.");
  }
  return key;
};

export const encryptMfaSecret = (secret: string, userId: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
};

export const decryptMfaSecret = (payload: string, userId: string) => {
  const [version, ivValue, tagValue, encryptedValue] = String(payload || "").split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored MFA secret is invalid.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64")
  );
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

export const createMfaSetup = async (email: string) => {
  const secret = authenticator.generateSecret(20);
  const uri = authenticator.keyuri(email, "Creativa Poeta", secret);
  return {
    secret,
    qrCodeDataUrl: await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    }),
  };
};

export const verifyMfaCode = async (secret: string, token: unknown) => {
  const normalized = String(token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const verifier = authenticator.clone();
  verifier.options = { window: 1 };
  return verifier.verify({ secret, token: normalized });
};

export const normalizeRecoveryCode = (value: unknown) =>
  String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const generateRecoveryCodes = () =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });

export const hashRecoveryCode = (code: unknown, userId: string) =>
  crypto
    .createHmac("sha256", getEncryptionKey())
    .update(`${userId}:${normalizeRecoveryCode(code)}`)
    .digest("hex");

export const findRecoveryCodeIndex = (hashes: string[], code: unknown, userId: string) => {
  const candidate = Buffer.from(hashRecoveryCode(code, userId), "hex");
  return hashes.findIndex((hash) => {
    const stored = Buffer.from(hash, "hex");
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
  });
};

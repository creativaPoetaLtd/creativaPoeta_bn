"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncConfiguredMailboxes = void 0;
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
const EmailMessage_1 = __importDefault(require("../models/EmailMessage"));
const emailFilters_1 = require("../utils/emailFilters");
const normalizeEnvKey = (value) => value
    .trim()
    .replace(/[^a-z0-9_]/gi, "_")
    .toUpperCase();
const getExtraMailboxKeys = () => {
    const declaredKeys = String(process.env.IMAP_EXTRA_KEYS || "")
        .split(/[,;\n]/)
        .map(normalizeEnvKey)
        .filter(Boolean);
    const discoveredKeys = Object.keys(process.env)
        .map((key) => { var _a; return (_a = key.match(/^IMAP_(.+)_(USER|ADDRESS|EMAIL)$/)) === null || _a === void 0 ? void 0 : _a[1]; })
        .filter((key) => Boolean(key))
        .map(normalizeEnvKey)
        .filter((key) => key !== "BE" && key !== "GLOBAL");
    return Array.from(new Set([...declaredKeys, ...discoveredKeys]));
};
const getMailboxConfigs = () => {
    const baseConfigs = [
        {
            key: "be",
            address: process.env.IMAP_BE_USER || process.env.IMAP_BE_ADDRESS,
            password: process.env.IMAP_BE_PASSWORD,
        },
        {
            key: "global",
            address: process.env.IMAP_GLOBAL_USER || process.env.IMAP_GLOBAL_ADDRESS,
            password: process.env.IMAP_GLOBAL_PASSWORD,
        },
    ];
    const extraConfigs = getExtraMailboxKeys().map((envKey) => {
        return {
            key: envKey.toLowerCase(),
            address: process.env[`IMAP_${envKey}_USER`] ||
                process.env[`IMAP_${envKey}_ADDRESS`] ||
                process.env[`IMAP_${envKey}_EMAIL`],
            password: process.env[`IMAP_${envKey}_PASSWORD`],
        };
    });
    return [...baseConfigs, ...extraConfigs]
        .filter((config) => config.address && config.password)
        .map((config) => ({
        key: config.key,
        address: String(config.address).trim().toLowerCase(),
        password: config.password,
    }));
};
const normalizeAddressList = (addresses) => {
    const list = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];
    return list.flatMap((addressObject) => (addressObject.value || [])
        .map((address) => { var _a; return (_a = address.address) === null || _a === void 0 ? void 0 : _a.toLowerCase(); })
        .filter((address) => Boolean(address)));
};
const createPreview = (text = "", html = "") => {
    const source = text || html.replace(/<[^>]+>/g, " ");
    return source.replace(/\s+/g, " ").trim().slice(0, 260);
};
const syncMailbox = async (config, limit) => {
    var _a, _b, _c, _d, _e;
    const client = new imapflow_1.ImapFlow({
        host: process.env.IMAP_HOST || "mail.infomaniak.com",
        port: Number(process.env.IMAP_PORT || 993),
        secure: process.env.IMAP_SECURE !== "false",
        auth: {
            user: config.address,
            pass: config.password,
        },
        logger: false,
    });
    const result = {
        mailbox: config.key,
        address: config.address,
        configured: true,
        imported: 0,
        updated: 0,
        skipped: 0,
    };
    try {
        await client.connect();
        const mailbox = await client.mailboxOpen("INBOX");
        const exists = mailbox.exists || 0;
        if (!exists) {
            await client.logout();
            return result;
        }
        const start = Math.max(1, exists - limit + 1);
        for await (const message of client.fetch(`${start}:*`, {
            uid: true,
            flags: true,
            internalDate: true,
            source: true,
            envelope: true,
        })) {
            try {
                const parsed = await (0, mailparser_1.simpleParser)(message.source);
                const from = (_b = (_a = parsed.from) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b[0];
                const text = parsed.text || "";
                const html = typeof parsed.html === "string" ? parsed.html : undefined;
                const receivedAt = parsed.date ||
                    (message.internalDate ? new Date(message.internalDate) : new Date());
                const isDmarc = (0, emailFilters_1.isDmarcReport)({
                    fromName: (from === null || from === void 0 ? void 0 : from.name) || "",
                    fromEmail: (from === null || from === void 0 ? void 0 : from.address) || "",
                    subject: parsed.subject || "",
                    text,
                    html,
                });
                const payload = {
                    mailbox: config.key,
                    mailboxAddress: config.address.toLowerCase(),
                    uid: message.uid,
                    messageId: parsed.messageId || `${config.key}-${message.uid}`,
                    fromName: (from === null || from === void 0 ? void 0 : from.name) || "",
                    fromEmail: ((_c = from === null || from === void 0 ? void 0 : from.address) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || "",
                    to: normalizeAddressList(parsed.to),
                    cc: normalizeAddressList(parsed.cc),
                    subject: parsed.subject || "(No subject)",
                    preview: createPreview(text, html),
                    text,
                    html,
                    folder: isDmarc ? emailFilters_1.DMARC_REPORT_FOLDER : "inbox",
                    status: isDmarc ? "read" : ((_d = message.flags) === null || _d === void 0 ? void 0 : _d.has("\\Seen")) ? "read" : "new",
                    isSeenOnServer: Boolean((_e = message.flags) === null || _e === void 0 ? void 0 : _e.has("\\Seen")),
                    receivedAt,
                    syncedAt: new Date(),
                    rawSize: Buffer.isBuffer(message.source) ? message.source.length : undefined,
                };
                const existing = await EmailMessage_1.default.findOne({
                    mailbox: config.key,
                    uid: message.uid,
                });
                if (existing) {
                    existing.set({
                        ...payload,
                        status: existing.status === "new" || existing.status === "read"
                            ? payload.status
                            : existing.status,
                    });
                    await existing.save();
                    result.updated += 1;
                }
                else {
                    await EmailMessage_1.default.create(payload);
                    result.imported += 1;
                }
            }
            catch {
                result.skipped += 1;
            }
        }
        await EmailMessage_1.default.updateMany({
            mailbox: config.key,
            folder: { $ne: emailFilters_1.DMARC_REPORT_FOLDER },
            ...emailFilters_1.dmarcReportMongoFilter,
        }, { $set: { folder: emailFilters_1.DMARC_REPORT_FOLDER, status: "read" } });
        await client.logout();
        return result;
    }
    catch (error) {
        try {
            await client.logout();
        }
        catch {
            // ignore logout errors after failed connections
        }
        return {
            ...result,
            error: (error === null || error === void 0 ? void 0 : error.message) || "Mailbox sync failed",
        };
    }
};
const syncConfiguredMailboxes = async (limit = 50) => {
    const configs = getMailboxConfigs();
    const configuredKeys = new Set(configs.map((config) => config.key));
    const missing = ["be", "global"]
        .filter((key) => !configuredKeys.has(key))
        .map((key) => ({
        mailbox: key,
        configured: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        error: "IMAP credentials are not configured.",
    }));
    const syncResults = await Promise.all(configs.map((config) => syncMailbox(config, Math.max(1, Math.min(limit, 200)))));
    const results = [...syncResults, ...missing];
    return {
        results,
        imported: results.reduce((total, item) => total + item.imported, 0),
        updated: results.reduce((total, item) => total + item.updated, 0),
        skipped: results.reduce((total, item) => total + item.skipped, 0),
    };
};
exports.syncConfiguredMailboxes = syncConfiguredMailboxes;

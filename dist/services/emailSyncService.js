"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncConfiguredMailboxes = exports.setMessageSeenOnServer = void 0;
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
const EmailMessage_1 = __importDefault(require("../models/EmailMessage"));
const emailFilters_1 = require("../utils/emailFilters");
const analyticsServerMetricService_1 = require("./analyticsServerMetricService");
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
    const extraConfigs = getExtraMailboxKeys().map((envKey) => ({
        key: envKey.toLowerCase(),
        address: process.env[`IMAP_${envKey}_USER`] ||
            process.env[`IMAP_${envKey}_ADDRESS`] ||
            process.env[`IMAP_${envKey}_EMAIL`],
        password: process.env[`IMAP_${envKey}_PASSWORD`],
    }));
    return [...baseConfigs, ...extraConfigs]
        .filter((config) => config.address && config.password)
        .map((config) => ({
        key: config.key,
        address: String(config.address).trim().toLowerCase(),
        password: config.password,
    }));
};
const createImapClient = (config) => new imapflow_1.ImapFlow({
    host: process.env.IMAP_HOST || "mail.infomaniak.com",
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
        user: config.address,
        pass: config.password,
    },
    connectionTimeout: Number(process.env.IMAP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.IMAP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.IMAP_SOCKET_TIMEOUT_MS || 20000),
    logger: false,
});
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
const normalizeFolderName = (value = "") => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const excludedSpecialUses = new Set(["\\sent", "\\drafts", "\\trash", "\\all"]);
const excludedFolderNames = /(^|[\/._ -])(sent|sent items|envoyes|brouillons|drafts|trash|corbeille|all mail)([\/._ -]|$)/i;
const shouldSyncFolder = (folder) => {
    var _a;
    if ((_a = folder.flags) === null || _a === void 0 ? void 0 : _a.has("\\Noselect"))
        return false;
    if (folder.specialUse && excludedSpecialUses.has(folder.specialUse.toLowerCase()))
        return false;
    return !excludedFolderNames.test(normalizeFolderName(folder.path));
};
let emailIndexesReady;
const ensureEmailSourceIndexes = async () => {
    if (!emailIndexesReady) {
        emailIndexesReady = (async () => {
            await EmailMessage_1.default.updateMany({ $or: [{ sourceFolder: { $exists: false } }, { sourceFolder: "" }] }, { $set: { sourceFolder: "INBOX" } });
            await EmailMessage_1.default.updateMany({ folder: "dmarc" }, { $set: { folder: emailFilters_1.SPAM_FOLDER, status: "read" } });
            const indexes = await EmailMessage_1.default.collection.indexes();
            const legacyUidIndex = indexes.find((index) => {
                const keys = Object.keys(index.key || {});
                return index.unique && keys.length === 2 && index.key.mailbox === 1 && index.key.uid === 1;
            });
            if (legacyUidIndex === null || legacyUidIndex === void 0 ? void 0 : legacyUidIndex.name) {
                await EmailMessage_1.default.collection.dropIndex(legacyUidIndex.name);
            }
            await EmailMessage_1.default.collection.createIndex({ mailbox: 1, sourceFolder: 1, uid: 1 }, { unique: true, sparse: true, name: "mailbox_sourceFolder_uid_unique" });
        })();
    }
    return emailIndexesReady;
};
const syncFolder = async (client, config, folder, limit, result) => {
    var _a, _b, _c, _d;
    const mailbox = await client.mailboxOpen(folder.path);
    const exists = mailbox.exists || 0;
    result.folders.push(folder.path);
    if (!exists)
        return;
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
            const messageId = parsed.messageId || `${config.key}-${folder.path}-${message.uid}`;
            const spamInput = {
                fromName: (from === null || from === void 0 ? void 0 : from.name) || "",
                fromEmail: (from === null || from === void 0 ? void 0 : from.address) || "",
                subject: parsed.subject || "",
                text,
                html,
                sourceFolder: folder.path,
                sourceSpecialUse: folder.specialUse,
            };
            const isSpam = (0, emailFilters_1.isSpamMessage)(spamInput);
            const serverSeen = Boolean((_c = message.flags) === null || _c === void 0 ? void 0 : _c.has("\\Seen"));
            const payload = {
                mailbox: config.key,
                mailboxAddress: config.address.toLowerCase(),
                uid: message.uid,
                sourceFolder: folder.path,
                sourceSpecialUse: folder.specialUse,
                messageId,
                fromName: (from === null || from === void 0 ? void 0 : from.name) || "",
                fromEmail: ((_d = from === null || from === void 0 ? void 0 : from.address) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || "",
                to: normalizeAddressList(parsed.to),
                cc: normalizeAddressList(parsed.cc),
                subject: parsed.subject || "(No subject)",
                preview: createPreview(text, html),
                text,
                html,
                folder: isSpam ? emailFilters_1.SPAM_FOLDER : "inbox",
                status: (0, emailFilters_1.isDmarcReport)(spamInput) ? "read" : serverSeen ? "read" : "new",
                isSeenOnServer: serverSeen,
                receivedAt,
                syncedAt: new Date(),
                rawSize: Buffer.isBuffer(message.source) ? message.source.length : undefined,
            };
            const existing = await EmailMessage_1.default.findOne({
                mailbox: config.key,
                $or: [
                    { sourceFolder: folder.path, uid: message.uid },
                    { messageId },
                ],
            });
            if (existing) {
                // Once imported, CP Mail owns the workflow status. IMAP flags are
                // mirrored separately and must never undo an admin's choice.
                existing.set({ ...payload, status: existing.status });
                await existing.save();
                result.updated += 1;
            }
            else {
                await EmailMessage_1.default.create(payload);
                result.imported += 1;
                if (isSpam) {
                    const folderClassified = String(folder.specialUse || "").toLowerCase() === "\\junk" ||
                        /(^|[\/._ -])(spam|junk|promotions?)([\/._ -]|$)/i.test(folder.path);
                    void (0, analyticsServerMetricService_1.recordServerMetric)({
                        metricType: "spam_blocked",
                        route: "mailbox_sync",
                        method: "SYNC",
                        outcome: "filtered",
                        category: (0, emailFilters_1.isDmarcReport)(spamInput)
                            ? "dmarc_report"
                            : folderClassified
                                ? "mailbox_folder"
                                : "content_rule",
                    });
                }
            }
        }
        catch {
            result.skipped += 1;
        }
    }
};
const syncMailbox = async (config, limit) => {
    const client = createImapClient(config);
    const result = {
        mailbox: config.key,
        address: config.address,
        configured: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        folders: [],
    };
    try {
        await client.connect();
        const folders = (await client.list())
            .filter(shouldSyncFolder)
            .sort((left, right) => {
            if (left.path.toUpperCase() === "INBOX")
                return -1;
            if (right.path.toUpperCase() === "INBOX")
                return 1;
            return left.path.localeCompare(right.path);
        });
        for (const folder of folders) {
            try {
                await syncFolder(client, config, folder, limit, result);
            }
            catch (error) {
                result.folderErrors = [
                    ...(result.folderErrors || []),
                    { folder: folder.path, error: (error === null || error === void 0 ? void 0 : error.message) || "Folder sync failed" },
                ];
            }
        }
        await EmailMessage_1.default.updateMany({
            mailbox: config.key,
            folder: { $ne: emailFilters_1.SPAM_FOLDER },
            ...emailFilters_1.spamMessageMongoFilter,
        }, { $set: { folder: emailFilters_1.SPAM_FOLDER, status: "read" } });
        await client.logout();
        return result;
    }
    catch (error) {
        try {
            await client.logout();
        }
        catch {
            // Ignore logout errors after failed connections.
        }
        return {
            ...result,
            error: (error === null || error === void 0 ? void 0 : error.message) || "Mailbox sync failed",
        };
    }
};
const setMessageSeenOnServer = async (message, seen) => {
    if (!message.uid)
        return false;
    const mailbox = String(message.mailbox || "").toLowerCase();
    const mailboxAddress = String(message.mailboxAddress || "").toLowerCase();
    const config = getMailboxConfigs().find((candidate) => candidate.key === mailbox || candidate.address === mailboxAddress);
    if (!config)
        return false;
    const client = createImapClient(config);
    try {
        await client.connect();
        await client.mailboxOpen(message.sourceFolder || "INBOX");
        const updated = seen
            ? await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true })
            : await client.messageFlagsRemove(message.uid, ["\\Seen"], { uid: true });
        await client.logout();
        return updated;
    }
    catch {
        try {
            await client.logout();
        }
        catch {
            // The local status remains authoritative when the IMAP server is unavailable.
        }
        return false;
    }
};
exports.setMessageSeenOnServer = setMessageSeenOnServer;
const syncConfiguredMailboxes = async (limit = 50) => {
    await ensureEmailSourceIndexes();
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
        folders: [],
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

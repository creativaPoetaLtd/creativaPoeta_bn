import { ImapFlow, ListResponse } from "imapflow";
import { simpleParser, AddressObject } from "mailparser";
import EmailMessage from "../models/EmailMessage";
import {
  SPAM_FOLDER,
  isDmarcReport,
  isSpamMessage,
  spamMessageMongoFilter,
} from "../utils/emailFilters";
import { recordServerMetric } from "./analyticsServerMetricService";

interface MailboxConfig {
  key: string;
  address: string;
  password: string;
}

interface SyncMailboxResult {
  mailbox: string;
  address?: string;
  configured: boolean;
  imported: number;
  updated: number;
  skipped: number;
  folders: string[];
  folderErrors?: Array<{ folder: string; error: string }>;
  error?: string;
}

export interface EmailSyncResult {
  results: SyncMailboxResult[];
  imported: number;
  updated: number;
  skipped: number;
}

const normalizeEnvKey = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_]/gi, "_")
    .toUpperCase();

const getExtraMailboxKeys = () => {
  const declaredKeys = String(process.env.IMAP_EXTRA_KEYS || "")
    .split(/[,;\n]/)
    .map(normalizeEnvKey)
    .filter(Boolean);

  const discoveredKeys = Object.keys(process.env)
    .map((key) => key.match(/^IMAP_(.+)_(USER|ADDRESS|EMAIL)$/)?.[1])
    .filter((key): key is string => Boolean(key))
    .map(normalizeEnvKey)
    .filter((key) => key !== "BE" && key !== "GLOBAL");

  return Array.from(new Set([...declaredKeys, ...discoveredKeys]));
};

const getMailboxConfigs = (): MailboxConfig[] => {
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
    address:
      process.env[`IMAP_${envKey}_USER`] ||
      process.env[`IMAP_${envKey}_ADDRESS`] ||
      process.env[`IMAP_${envKey}_EMAIL`],
    password: process.env[`IMAP_${envKey}_PASSWORD`],
  }));

  return [...baseConfigs, ...extraConfigs]
    .filter((config) => config.address && config.password)
    .map((config) => ({
      key: config.key,
      address: String(config.address).trim().toLowerCase(),
      password: config.password as string,
    }));
};

const createImapClient = (config: MailboxConfig) =>
  new ImapFlow({
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

const normalizeAddressList = (addresses?: AddressObject | AddressObject[]) => {
  const list = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];
  return list.flatMap((addressObject) =>
    (addressObject.value || [])
      .map((address) => address.address?.toLowerCase())
      .filter((address): address is string => Boolean(address))
  );
};

const createPreview = (text = "", html = "") => {
  const source = text || html.replace(/<[^>]+>/g, " ");
  return source.replace(/\s+/g, " ").trim().slice(0, 260);
};

const normalizeFolderName = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const excludedSpecialUses = new Set(["\\sent", "\\drafts", "\\trash", "\\all"]);
const excludedFolderNames = /(^|[\/._ -])(sent|sent items|envoyes|brouillons|drafts|trash|corbeille|all mail)([\/._ -]|$)/i;

const shouldSyncFolder = (folder: ListResponse) => {
  if (folder.flags?.has("\\Noselect")) return false;
  if (folder.specialUse && excludedSpecialUses.has(folder.specialUse.toLowerCase())) return false;
  return !excludedFolderNames.test(normalizeFolderName(folder.path));
};

let emailSourceDataReady: Promise<void> | undefined;

const ensureEmailSourceData = async () => {
  if (!emailSourceDataReady) {
    emailSourceDataReady = (async () => {
      await EmailMessage.updateMany(
        { $or: [{ sourceFolder: { $exists: false } }, { sourceFolder: "" }] },
        { $set: { sourceFolder: "INBOX" } }
      );
      await EmailMessage.updateMany(
        { folder: "dmarc" },
        { $set: { folder: SPAM_FOLDER, status: "read" } }
      );
    })();
  }

  return emailSourceDataReady;
};

const syncFolder = async (
  client: ImapFlow,
  config: MailboxConfig,
  folder: ListResponse,
  limit: number,
  result: SyncMailboxResult
) => {
  const mailbox = await client.mailboxOpen(folder.path);
  const exists = mailbox.exists || 0;
  result.folders.push(folder.path);
  if (!exists) return;

  const start = Math.max(1, exists - limit + 1);
  for await (const message of client.fetch(`${start}:*`, {
    uid: true,
    flags: true,
    internalDate: true,
    source: true,
    envelope: true,
  })) {
    try {
      const parsed = await simpleParser(message.source as any);
      const from = parsed.from?.value?.[0];
      const text = parsed.text || "";
      const html = typeof parsed.html === "string" ? parsed.html : undefined;
      const receivedAt =
        parsed.date ||
        (message.internalDate ? new Date(message.internalDate as any) : new Date());
      const messageId = parsed.messageId || `${config.key}-${folder.path}-${message.uid}`;
      const spamInput = {
        fromName: from?.name || "",
        fromEmail: from?.address || "",
        subject: parsed.subject || "",
        text,
        html,
        sourceFolder: folder.path,
        sourceSpecialUse: folder.specialUse,
      };
      const isSpam = isSpamMessage(spamInput);
      const serverSeen = Boolean(message.flags?.has("\\Seen"));
      const payload = {
        mailbox: config.key,
        mailboxAddress: config.address.toLowerCase(),
        uid: message.uid,
        sourceFolder: folder.path,
        sourceSpecialUse: folder.specialUse,
        messageId,
        fromName: from?.name || "",
        fromEmail: from?.address?.toLowerCase() || "",
        to: normalizeAddressList(parsed.to as AddressObject | AddressObject[] | undefined),
        cc: normalizeAddressList(parsed.cc as AddressObject | AddressObject[] | undefined),
        subject: parsed.subject || "(No subject)",
        preview: createPreview(text, html),
        text,
        html,
        folder: isSpam ? SPAM_FOLDER : "inbox",
        status: isDmarcReport(spamInput) ? "read" : serverSeen ? "read" : "new",
        isSeenOnServer: serverSeen,
        receivedAt,
        syncedAt: new Date(),
        rawSize: Buffer.isBuffer(message.source) ? message.source.length : undefined,
      };

      const existing = await EmailMessage.findOne({
        mailbox: config.key,
        $or: [
          { sourceFolder: folder.path, uid: message.uid },
          { messageId },
        ],
      }).setOptions({ includeDeleted: true });

      if (existing) {
        // A message intentionally removed from CP Mail must not reappear on
        // the next IMAP synchronization while it still exists upstream.
        if ((existing as any).isDeleted === true) {
          result.skipped += 1;
          continue;
        }
        // Once imported, CP Mail owns the workflow status. IMAP flags are
        // mirrored separately and must never undo an admin's choice.
        existing.set({ ...payload, status: existing.status });
        await existing.save();
        result.updated += 1;
      } else {
        await EmailMessage.create(payload);
        result.imported += 1;
        if (isSpam) {
          const folderClassified =
            String(folder.specialUse || "").toLowerCase() === "\\junk" ||
            /(^|[\/._ -])(spam|junk|promotions?)([\/._ -]|$)/i.test(folder.path);
          void recordServerMetric({
            metricType: "spam_blocked",
            route: "mailbox_sync",
            method: "SYNC",
            outcome: "filtered",
            category: isDmarcReport(spamInput)
              ? "dmarc_report"
              : folderClassified
                ? "mailbox_folder"
                : "content_rule",
          });
        }
      }
    } catch {
      result.skipped += 1;
    }
  }
};

const syncMailbox = async (
  config: MailboxConfig,
  limit: number
): Promise<SyncMailboxResult> => {
  const client = createImapClient(config);
  const result: SyncMailboxResult = {
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
        if (left.path.toUpperCase() === "INBOX") return -1;
        if (right.path.toUpperCase() === "INBOX") return 1;
        return left.path.localeCompare(right.path);
      });

    for (const folder of folders) {
      try {
        await syncFolder(client, config, folder, limit, result);
      } catch (error: any) {
        result.folderErrors = [
          ...(result.folderErrors || []),
          { folder: folder.path, error: error?.message || "Folder sync failed" },
        ];
      }
    }

    await EmailMessage.updateMany(
      {
        mailbox: config.key,
        folder: { $ne: SPAM_FOLDER },
        ...spamMessageMongoFilter,
      },
      { $set: { folder: SPAM_FOLDER, status: "read" } }
    );

    await client.logout();
    return result;
  } catch (error: any) {
    try {
      await client.logout();
    } catch {
      // Ignore logout errors after failed connections.
    }

    return {
      ...result,
      error: error?.message || "Mailbox sync failed",
    };
  }
};

export const setMessageSeenOnServer = async (message: {
  mailbox?: string;
  mailboxAddress?: string;
  sourceFolder?: string;
  uid?: number;
}, seen: boolean): Promise<boolean> => {
  if (!message.uid) return false;

  const mailbox = String(message.mailbox || "").toLowerCase();
  const mailboxAddress = String(message.mailboxAddress || "").toLowerCase();
  const config = getMailboxConfigs().find(
    (candidate) => candidate.key === mailbox || candidate.address === mailboxAddress
  );
  if (!config) return false;

  const client = createImapClient(config);
  try {
    await client.connect();
    await client.mailboxOpen(message.sourceFolder || "INBOX");
    const updated = seen
      ? await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true })
      : await client.messageFlagsRemove(message.uid, ["\\Seen"], { uid: true });
    await client.logout();
    return updated;
  } catch {
    try {
      await client.logout();
    } catch {
      // The local status remains authoritative when the IMAP server is unavailable.
    }
    return false;
  }
};

export const syncConfiguredMailboxes = async (limit = 50): Promise<EmailSyncResult> => {
  await ensureEmailSourceData();
  const configs = getMailboxConfigs();
  const configuredKeys = new Set(configs.map((config) => config.key));
  const missing: SyncMailboxResult[] = ["be", "global"]
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

  const syncResults = await Promise.all(
    configs.map((config) => syncMailbox(config, Math.max(1, Math.min(limit, 200))))
  );
  const results = [...syncResults, ...missing];

  return {
    results,
    imported: results.reduce((total, item) => total + item.imported, 0),
    updated: results.reduce((total, item) => total + item.updated, 0),
    skipped: results.reduce((total, item) => total + item.skipped, 0),
  };
};

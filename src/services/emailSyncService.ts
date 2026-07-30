import { ImapFlow } from "imapflow";
import { simpleParser, AddressObject } from "mailparser";
import EmailMessage from "../models/EmailMessage";

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

const getExtraMailboxKeys = () =>
  String(process.env.IMAP_EXTRA_KEYS || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

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

  const extraConfigs = getExtraMailboxKeys().map((key) => {
    const envKey = normalizeEnvKey(key);
    return {
      key: key.trim().toLowerCase(),
      address:
        process.env[`IMAP_${envKey}_USER`] ||
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
      password: config.password as string,
    }));
};

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

const syncMailbox = async (
  config: MailboxConfig,
  limit: number
): Promise<SyncMailboxResult> => {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "mail.infomaniak.com",
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
      user: config.address,
      pass: config.password,
    },
    logger: false,
  });

  const result: SyncMailboxResult = {
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
        const parsed = await simpleParser(message.source as any);
        const from = parsed.from?.value?.[0];
        const text = parsed.text || "";
        const html = typeof parsed.html === "string" ? parsed.html : undefined;
        const receivedAt =
          parsed.date ||
          (message.internalDate ? new Date(message.internalDate as any) : new Date());

        const payload = {
          mailbox: config.key,
          mailboxAddress: config.address.toLowerCase(),
          uid: message.uid,
          messageId: parsed.messageId || `${config.key}-${message.uid}`,
          fromName: from?.name || "",
          fromEmail: from?.address?.toLowerCase() || "",
          to: normalizeAddressList(parsed.to as AddressObject | AddressObject[] | undefined),
          cc: normalizeAddressList(parsed.cc as AddressObject | AddressObject[] | undefined),
          subject: parsed.subject || "(No subject)",
          preview: createPreview(text, html),
          text,
          html,
          status: message.flags?.has("\\Seen") ? "read" : "new",
          isSeenOnServer: Boolean(message.flags?.has("\\Seen")),
          receivedAt,
          syncedAt: new Date(),
          rawSize: Buffer.isBuffer(message.source) ? message.source.length : undefined,
        };

        const existing = await EmailMessage.findOne({
          mailbox: config.key,
          uid: message.uid,
        });

        if (existing) {
          existing.set({
            ...payload,
            status:
              existing.status === "new" || existing.status === "read"
                ? payload.status
                : existing.status,
          });
          await existing.save();
          result.updated += 1;
        } else {
          await EmailMessage.create(payload);
          result.imported += 1;
        }
      } catch {
        result.skipped += 1;
      }
    }

    await client.logout();
    return result;
  } catch (error: any) {
    try {
      await client.logout();
    } catch {
      // ignore logout errors after failed connections
    }

    return {
      ...result,
      error: error?.message || "Mailbox sync failed",
    };
  }
};

export const syncConfiguredMailboxes = async (limit = 50): Promise<EmailSyncResult> => {
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


import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { renderBrandedEmail } from "./emailTemplate";

dotenv.config();

interface SendEmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer;
  contentType?: string;
}

interface SendEmailOptions {
  attachments?: SendEmailAttachment[];
  cc?: string[];
  bcc?: string[];
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  preheader?: string;
  title?: string;
  wrap?: boolean;
  signature?: string;
}

const isConfigured = (value?: string) => Boolean(value && value.trim());
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail?: string;
  fromName?: string;
}

const normalizeEnvKey = (value = "") =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getExtraMailboxKeys = () => {
  const declaredKeys = ["BE", "GLOBAL", process.env.SMTP_EXTRA_KEYS, process.env.IMAP_EXTRA_KEYS]
    .flatMap((value) => String(value || "").split(/[\n,;]/))
    .map(normalizeEnvKey)
    .filter(Boolean);

  const discoveredKeys = Object.keys(process.env)
    .map((key) => key.match(/^(SMTP|IMAP)_(.+)_(USER|ADDRESS|EMAIL)$/)?.[2])
    .filter((key): key is string => Boolean(key))
    .map(normalizeEnvKey);

  return Array.from(new Set([...declaredKeys, ...discoveredKeys]));
};

const getMailboxSmtpConfigs = (): SmtpConfig[] => {
  const configs: SmtpConfig[] = [];
  const baseHost = process.env.SMTP_HOST || "";
  const basePort = Number(process.env.SMTP_PORT || 465);
  const baseSecure = process.env.SMTP_SECURE !== "false";

  if (isConfigured(baseHost) && isConfigured(process.env.SMTP_USER) && isConfigured(process.env.SMTP_PASSWORD)) {
    configs.push({
      host: baseHost,
      port: basePort,
      secure: baseSecure,
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASSWORD as string,
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      fromName: process.env.SMTP_FROM_NAME,
    });
  }

  getExtraMailboxKeys().forEach((key) => {
    const user =
      process.env[`SMTP_${key}_USER`] ||
      process.env[`SMTP_${key}_ADDRESS`] ||
      process.env[`SMTP_${key}_EMAIL`] ||
      process.env[`IMAP_${key}_USER`] ||
      process.env[`IMAP_${key}_ADDRESS`] ||
      process.env[`IMAP_${key}_EMAIL`];
    const pass = process.env[`SMTP_${key}_PASSWORD`] || process.env[`IMAP_${key}_PASSWORD`];
    const host = process.env[`SMTP_${key}_HOST`] || baseHost;

    if (!isConfigured(host) || !isConfigured(user) || !isConfigured(pass)) return;

    configs.push({
      host,
      port: Number(process.env[`SMTP_${key}_PORT`] || basePort),
      secure: process.env[`SMTP_${key}_SECURE`] ? process.env[`SMTP_${key}_SECURE`] !== "false" : baseSecure,
      user: user as string,
      pass: pass as string,
      fromEmail: process.env[`SMTP_${key}_FROM_EMAIL`] || user,
      fromName: process.env[`SMTP_${key}_FROM_NAME`],
    });
  });

  return configs;
};

const resolveSmtpConfig = (fromEmail?: string): SmtpConfig | undefined => {
  const configs = getMailboxSmtpConfigs();
  const normalizedFrom = String(fromEmail || "").toLowerCase().trim();
  if (normalizedFrom) {
    const matchingConfig = configs.find((config) =>
      [config.user, config.fromEmail]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().trim() === normalizedFrom)
    );
    return matchingConfig;
  }
  return configs[0];
};

const stripHtml = (html = "") =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderDirectSignature = (signature?: string) => {
  const cleanSignature = String(signature || "").trim();
  if (!cleanSignature) return "";
  return `<p style="margin:24px 0 0;">Best regards,<br />${escapeHtml(cleanSignature).replace(/\n/g, "<br />")}</p>`;
};

const sendEmail = async (
  to: string | string[],
  subject: string,
  htmlContent: string,
  attachmentsOrOptions?: SendEmailAttachment[] | SendEmailOptions
): Promise<void> => {
  try {
    const options: SendEmailOptions = Array.isArray(attachmentsOrOptions)
      ? { attachments: attachmentsOrOptions }
      : attachmentsOrOptions || {};

    const smtpConfig = resolveSmtpConfig(options.fromEmail);
    const hasGmailFallback = isConfigured(process.env.EMAIL_USER) && isConfigured(process.env.EMAIL_PASS);

    if (options.fromEmail && !smtpConfig) {
      throw new Error("Sender mailbox credentials are not configured.");
    }

    if (!smtpConfig && !hasGmailFallback) {
      throw new Error("Email credentials not configured. Add SMTP variables or EMAIL_USER/EMAIL_PASS.");
    }

    const transporter = smtpConfig
      ? nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 20000,
          rateLimit: 5,
        })
      : nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 20000,
          rateLimit: 5,
        });

    await transporter.verify();

    const defaultFromEmail =
      smtpConfig?.fromEmail ||
      smtpConfig?.user ||
      process.env.SMTP_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      process.env.SMTP_USER ||
      process.env.EMAIL_USER;
    const fromEmail = options.fromEmail || defaultFromEmail;
    const fromName = options.fromName || smtpConfig?.fromName || process.env.SMTP_FROM_NAME || "Creativa Poeta";
    const directSignature = renderDirectSignature(options.signature);
    const html =
      options.wrap === false
        ? `${htmlContent}${directSignature}`
        : renderBrandedEmail({
            title: options.title || subject,
            preheader: options.preheader || stripHtml(htmlContent).slice(0, 130),
            content: htmlContent,
            signature: options.signature,
          });

    const result = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      cc: options.cc,
      bcc: options.bcc,
      subject,
      html,
      text: [stripHtml(htmlContent), options.signature ? `Best regards,\n${options.signature.trim()}` : ""]
        .filter(Boolean)
        .join("\n\n"),
      replyTo: options.replyTo || (options.fromEmail ? fromEmail : process.env.REPLY_TO_EMAIL || fromEmail),
      attachments: options.attachments,
    });

    console.log(`Email sent successfully to ${Array.isArray(to) ? to.join(", ") : to}. Message ID: ${result.messageId}`);
  } catch (error) {
    console.error("Email sending failed:", error);

    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);

      if (error.message.includes("Invalid login")) {
        console.error("Authentication Error: check the mailbox user and app password.");
      } else if (error.message.includes("Less secure app")) {
        console.error("Gmail Security Error: enable 2FA and use an app password.");
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
        console.error("Network Error: cannot connect to the SMTP server.");
      }
    }

    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};

export default sendEmail;


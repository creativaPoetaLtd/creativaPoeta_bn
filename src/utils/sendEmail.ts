import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { renderBrandedEmail } from "./emailTemplate";

dotenv.config();

interface SendEmailOptions {
  attachments?: { filename: string; path: string }[];
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

const stripHtml = (html = "") =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sendEmail = async (
  to: string | string[],
  subject: string,
  htmlContent: string,
  attachmentsOrOptions?: { filename: string; path: string }[] | SendEmailOptions
): Promise<void> => {
  try {
    const options: SendEmailOptions = Array.isArray(attachmentsOrOptions)
      ? { attachments: attachmentsOrOptions }
      : attachmentsOrOptions || {};

    const hasSmtpConfig =
      isConfigured(process.env.SMTP_HOST) &&
      isConfigured(process.env.SMTP_USER) &&
      isConfigured(process.env.SMTP_PASSWORD);
    const hasGmailFallback = isConfigured(process.env.EMAIL_USER) && isConfigured(process.env.EMAIL_PASS);

    if (!hasSmtpConfig && !hasGmailFallback) {
      throw new Error("Email credentials not configured. Add SMTP_* variables or EMAIL_USER/EMAIL_PASS.");
    }

    const transporter = hasSmtpConfig
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 465),
          secure: process.env.SMTP_SECURE !== "false",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
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
      process.env.SMTP_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      process.env.SMTP_USER ||
      process.env.EMAIL_USER;
    const fromEmail = options.fromEmail || defaultFromEmail;
    const fromName = options.fromName || process.env.SMTP_FROM_NAME || "Creativa Poeta";
    const html =
      options.wrap === false
        ? htmlContent
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
      text: stripHtml(htmlContent),
      replyTo: options.replyTo || process.env.REPLY_TO_EMAIL || fromEmail,
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

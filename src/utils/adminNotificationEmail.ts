import sendEmail, { SendEmailOptions } from "./sendEmail";

const normalizeEmail = (value: unknown) => String(value || "").trim().toLowerCase();
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Administrative notifications must have an explicit destination.
 * EMAIL_USER is a transport credential/fallback sender and must never be
 * treated as the mailbox that owns operational notifications.
 */
export const getAdminNotificationEmail = () => {
  const recipient = normalizeEmail(process.env.ADMIN_NOTIFICATION_EMAIL);
  return isValidEmail(recipient) ? recipient : "";
};

export const sendAdminNotificationEmail = async (
  subject: string,
  html: string,
  options?: SendEmailOptions
): Promise<boolean> => {
  const recipient = getAdminNotificationEmail();

  if (!recipient) {
    console.error(
      "Administrative email not sent: ADMIN_NOTIFICATION_EMAIL is missing or invalid."
    );
    return false;
  }

  try {
    await sendEmail(recipient, subject, html, options);
    return true;
  } catch (error) {
    console.error(
      "Administrative notification email failed:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
};

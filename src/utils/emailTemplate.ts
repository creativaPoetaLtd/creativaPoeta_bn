interface BrandedEmailOptions {
  preheader?: string;
  title?: string;
  content: string;
  signature?: string;
}

const SITE_URL = "https://creativapoeta.com";
const CONTACT_EMAIL = "contact@creativapoeta.com";
const PHONE_LABEL = "+32 473 29 71 12";
const PHONE_URL = "tel:+32473297112";

export const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const formatParagraphs = (value = "") =>
  escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "<br>"))
    .map((paragraph) => `<p style="margin:0 0 14px;">${paragraph}</p>`)
    .join("");

const renderSignature = (signature?: string) => {
  const cleanSignature = String(signature || "").trim();
  if (!cleanSignature) return "";

  return `<div style="margin:0 0 10px;color:#b4852b;font-size:16px;font-weight:800;">${formatParagraphs(cleanSignature)}</div>`;
};

export const renderBrandedEmail = ({
  preheader = "Message de Creativa Poeta",
  title,
  content,
  signature,
}: BrandedEmailOptions) => `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title || "Creativa Poeta")}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#101828;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:22px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse;">
            <tr>
              <td align="left" style="padding:0 0 26px;">
                <a href="${SITE_URL}" style="display:inline-block;text-decoration:none;color:#101828;">
                  <span style="display:block;font-size:24px;line-height:1;font-weight:800;letter-spacing:-.04em;color:#101828;white-space:nowrap;">Creativa Poeta</span>
                  <span style="display:block;margin-top:5px;font-size:10px;line-height:1.2;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#b4852b;white-space:nowrap;">inspired innovation</span>
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 26px;font-size:16px;line-height:1.72;color:#182640;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 4px;color:#526074;font-size:14px;line-height:1.65;">
                <div style="margin:0 0 6px;color:#344054;font-size:15px;font-style:italic;">Best regards,</div>
                ${renderSignature(signature)}
                <div style="margin:0;">
                  <a href="mailto:${CONTACT_EMAIL}" style="color:#526074;text-decoration:none;word-break:break-word;">${CONTACT_EMAIL}</a>
                </div>
                <div style="margin:2px 0 0;">
                  <a href="${SITE_URL}" style="color:#526074;text-decoration:none;word-break:break-word;">www.creativapoeta.com</a>
                </div>
                <div style="margin:2px 0 0;">
                  <a href="${PHONE_URL}" style="color:#526074;text-decoration:none;white-space:nowrap;">${PHONE_LABEL}</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

interface BrandedEmailOptions {
  preheader?: string;
  title?: string;
  content: string;
}

const SITE_URL = "https://creativapoeta.com";
const LOGO_URL = `${SITE_URL}/poeta.jpeg`;
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

export const renderBrandedEmail = ({
  preheader = "Message de Creativa Poeta",
  title = "Creativa Poeta",
  content,
}: BrandedEmailOptions) => `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#ffffff;color:#071a33;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
      <tr>
        <td align="center" style="padding:22px 14px 10px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;border-collapse:collapse;">
            <tr>
              <td align="left" valign="middle" style="padding-bottom:18px;border-bottom:1px solid #edf0f4;">
                <a href="${SITE_URL}" style="text-decoration:none;color:#071a33;">
                  <img src="${LOGO_URL}" width="44" height="44" alt="Creativa Poeta" style="display:inline-block;border-radius:50%;vertical-align:middle;border:1px solid #eef1f5;" />
                  <span style="display:inline-block;vertical-align:middle;margin-left:10px;">
                    <span style="display:block;font-size:18px;line-height:1;font-weight:800;color:#071a33;letter-spacing:-.02em;">Creativa Poeta</span>
                    <span style="display:block;margin-top:4px;font-size:9px;line-height:1.2;color:#b4852b;font-weight:700;letter-spacing:.22em;text-transform:uppercase;">Inspired innovation</span>
                  </span>
                </a>
              </td>
              <td align="right" valign="middle" style="padding-bottom:18px;border-bottom:1px solid #edf0f4;font-size:11px;line-height:1.4;font-weight:400;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">
                <a href="${SITE_URL}/#services" style="color:#6f7b8d;text-decoration:none;margin-left:12px;font-weight:400;">Services</a>
                <a href="${SITE_URL}/start-project" style="color:#6f7b8d;text-decoration:none;margin-left:12px;font-weight:400;">Projet</a>
                <a href="${SITE_URL}/contact" style="color:#6f7b8d;text-decoration:none;margin-left:12px;font-weight:400;">Contact</a>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:34px 2px 18px;font-size:16px;line-height:1.72;color:#17243b;">
                ${content}
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:18px 2px 28px;border-top:1px solid #edf0f4;color:#526074;font-size:14px;line-height:1.75;">
                <div style="color:#071a33;font-size:15px;font-style:italic;">Cordialement,</div>
                <div style="margin-top:4px;color:#b4852b;font-size:16px;font-weight:800;">The Creativa Poeta Team</div>
                <div style="margin-top:10px;">
                  <a href="mailto:${CONTACT_EMAIL}" style="color:#526074;text-decoration:none;">${CONTACT_EMAIL}</a>
                  <span style="color:#c8ced8;"> &nbsp;|&nbsp; </span>
                  <a href="${SITE_URL}" style="color:#526074;text-decoration:none;">www.creativapoeta.com</a>
                  <span style="color:#c8ced8;"> &nbsp;|&nbsp; </span>
                  <a href="${PHONE_URL}" style="color:#526074;text-decoration:none;">${PHONE_LABEL}</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

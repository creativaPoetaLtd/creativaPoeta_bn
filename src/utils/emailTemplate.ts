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
const WHATSAPP_URL = "https://wa.me/32473297112";

const domains = [
  { code: "DEV", title: "Development", text: "Sites web, apps et outils digitaux." },
  { code: "DES", title: "Digital Creation", text: "Identite visuelle et supports de marque." },
  { code: "AI", title: "AI Solutions", text: "Assistants IA et automatisations." },
  { code: "SEO", title: "Online Visibility", text: "Google, AEO, GEO et presence locale." },
  { code: "IT", title: "IT Support", text: "Configuration, securite et assistance." },
  { code: "TXT", title: "Content & Writing", text: "Articles, CV, rapports et documents." },
];

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

const renderDomains = () => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
    <tr>
      ${domains
        .map(
          (domain, index) => `
            <td width="16.66%" valign="top" style="padding:0 8px;border-left:${index === 0 ? "0" : "1px solid #dde3ed"};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="font-size:10px;line-height:1;font-weight:800;color:#b4852b;letter-spacing:.08em;">
                    ${domain.code}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:8px;font-size:11px;line-height:1.2;font-weight:800;text-transform:uppercase;color:#10213a;">
                    ${domain.title}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:6px;font-size:11px;line-height:1.45;color:#687489;">
                    ${domain.text}
                  </td>
                </tr>
              </table>
            </td>
          `,
        )
        .join("")}
    </tr>
  </table>
`;

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
  <body style="margin:0;background:#f4f6f9;color:#071a33;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f9;padding:22px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:820px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8f0;box-shadow:0 12px 32px rgba(7,26,51,.07);">
            <tr>
              <td style="background:#ffffff;padding:18px 28px;border-bottom:1px solid #edf1f6;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" valign="middle">
                      <a href="${SITE_URL}" style="text-decoration:none;color:#071a33;">
                        <img src="${LOGO_URL}" width="46" height="46" alt="Creativa Poeta" style="display:inline-block;border-radius:50%;vertical-align:middle;border:1px solid #e8edf4;" />
                        <span style="display:inline-block;vertical-align:middle;margin-left:11px;">
                          <span style="display:block;font-size:18px;line-height:1;font-weight:800;color:#071a33;letter-spacing:-.02em;">Creativa Poeta</span>
                          <span style="display:block;margin-top:4px;font-size:9px;line-height:1.2;color:#b4852b;font-weight:700;letter-spacing:.22em;text-transform:uppercase;">Inspired innovation</span>
                        </span>
                      </a>
                    </td>
                    <td align="right" valign="middle" style="font-size:11px;line-height:1.4;font-weight:400;text-transform:uppercase;letter-spacing:.04em;">
                      <a href="${SITE_URL}/#services" style="color:#6d7788;text-decoration:none;margin-left:12px;font-weight:400;">Services</a>
                      <a href="${SITE_URL}/start-project" style="color:#6d7788;text-decoration:none;margin-left:12px;font-weight:400;">Projet</a>
                      <a href="${SITE_URL}/contact" style="color:#6d7788;text-decoration:none;margin-left:12px;font-weight:400;">Contact</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 42px 24px;font-size:16px;line-height:1.7;color:#182640;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:0 42px;">
                <div style="height:1px;background:#d7a947;line-height:1px;font-size:1px;opacity:.72;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 30px;">
                ${renderDomains()}
              </td>
            </tr>
            <tr>
              <td style="background:#edf2f7;padding:26px 34px;color:#10213a;border-top:1px solid #dfe6f0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding-bottom:18px;">
                      <img src="${LOGO_URL}" width="120" height="120" alt="" style="display:block;border-radius:50%;opacity:.11;" />
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d8e0eb;padding-top:18px;">
                        <tr>
                          <td valign="middle" style="font-size:14px;line-height:1.8;color:#24334d;">
                            <a href="mailto:${CONTACT_EMAIL}" style="color:#24334d;text-decoration:none;">${CONTACT_EMAIL}</a><br />
                            <a href="${PHONE_URL}" style="color:#24334d;text-decoration:none;">${PHONE_LABEL}</a><br />
                            <a href="${SITE_URL}" style="color:#24334d;text-decoration:none;">www.creativapoeta.com</a>
                          </td>
                          <td align="right" valign="middle">
                            <a href="${WHATSAPP_URL}" style="display:inline-block;background:#25d366;color:#071a33;text-decoration:none;border-radius:999px;padding:10px 18px;font-size:12px;line-height:1;font-weight:800;text-transform:uppercase;letter-spacing:.03em;">WhatsApp</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

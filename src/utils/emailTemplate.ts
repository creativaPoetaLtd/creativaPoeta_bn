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
  {
    icon: "&lt;/&gt;",
    title: "Development",
    text: "Sites web, applications, logiciels et outils digitaux adaptes a vos besoins.",
  },
  {
    icon: "&#9998;",
    title: "Digital Creation",
    text: "Identite visuelle, supports graphiques, presentations et contenus de marque.",
  },
  {
    icon: "AI",
    title: "AI Solutions",
    text: "Assistants IA, bases de connaissances, agents connectes et automatisations.",
  },
  {
    icon: "&#8599;",
    title: "Online Visibility",
    text: "Presence Google, SEO, AEO, GEO, cartes, reseaux sociaux et visibilite locale.",
  },
  {
    icon: "&#9742;",
    title: "IT Support",
    text: "Aide ordinateur, smartphone, reseau, logiciels, securite et configuration.",
  },
  {
    icon: "&#9997;",
    title: "Content & Writing",
    text: "Textes, CV, lettres, profils LinkedIn, rapports, articles, guides et documents.",
  },
];

const footerLinks = [
  { label: "Services", href: `${SITE_URL}/#services` },
  { label: "Demarrer un projet", href: `${SITE_URL}/start-project` },
  { label: "Diagnostic visibilite", href: `${SITE_URL}/tester-visibilite` },
  { label: "Blog", href: `${SITE_URL}/blog` },
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
            <td width="16.66%" valign="top" style="padding:0 10px;border-left:${index === 0 ? "0" : "1px solid #d8dde8"};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="height:48px;">
                    <div style="display:inline-block;width:42px;height:42px;border:2px solid #071a33;border-radius:10px;color:#071a33;font-size:18px;line-height:42px;font-weight:900;text-align:center;">
                      ${domain.icon}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;font-size:12px;line-height:1.25;font-weight:900;text-transform:uppercase;color:#071a33;">
                    ${domain.title}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:8px;font-size:12px;line-height:1.55;color:#36445c;">
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

const renderFooterLinks = () =>
  footerLinks
    .map(
      (link) =>
        `<a href="${link.href}" style="color:#dce6f6;text-decoration:none;font-size:12px;line-height:1.8;margin-right:14px;">${link.label}</a>`,
    )
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
  <body style="margin:0;background:#eef2f7;color:#071a33;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:860px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dfe7f2;box-shadow:0 18px 45px rgba(7,26,51,.12);">
            <tr>
              <td style="background:#06172f;padding:18px 28px;border-bottom:4px solid #e4af34;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="left" valign="middle">
                      <a href="${SITE_URL}" style="text-decoration:none;color:#ffffff;">
                        <img src="${LOGO_URL}" width="50" height="50" alt="Creativa Poeta" style="display:inline-block;border-radius:50%;vertical-align:middle;border:1px solid rgba(228,175,52,.55);" />
                        <span style="display:inline-block;vertical-align:middle;margin-left:12px;">
                          <span style="display:block;font-size:20px;line-height:1;font-weight:900;color:#ffffff;letter-spacing:-.02em;">Creativa Poeta</span>
                          <span style="display:block;margin-top:4px;font-size:10px;line-height:1.2;color:#e4af34;font-weight:800;letter-spacing:.24em;text-transform:uppercase;">Inspired innovation</span>
                        </span>
                      </a>
                    </td>
                    <td align="right" valign="middle" style="font-size:12px;line-height:1.4;font-weight:800;text-transform:uppercase;">
                      <a href="${SITE_URL}/#services" style="color:#ffffff;text-decoration:none;margin-left:12px;">Services</a>
                      <a href="${SITE_URL}/start-project" style="color:#ffffff;text-decoration:none;margin-left:12px;">Projet</a>
                      <a href="${SITE_URL}/contact" style="color:#ffffff;text-decoration:none;margin-left:12px;">Contact</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 42px 20px;font-size:16px;line-height:1.7;color:#182640;">
                <div style="font-size:25px;line-height:1.25;color:#071a33;font-weight:900;margin:0 0 18px;">
                  ${escapeHtml(title)}
                </div>
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 42px 0;">
                <div style="height:1px;background:#d7a947;line-height:1px;font-size:1px;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 28px 40px;">
                ${renderDomains()}
              </td>
            </tr>
            <tr>
              <td style="background:#06172f;padding:34px 38px;color:#ffffff;position:relative;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding-bottom:18px;">
                      <img src="${LOGO_URL}" width="140" height="140" alt="" style="display:block;border-radius:50%;opacity:.18;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="font-size:18px;line-height:1.35;font-weight:900;color:#ffffff;">
                      Sites, apps, IA, visibilite, design, contenu et assistance numerique.
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:16px 0 20px;font-size:13px;line-height:1.7;color:#dce6f6;">
                      ${renderFooterLinks()}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid rgba(228,175,52,.42);padding-top:22px;">
                        <tr>
                          <td width="50%" valign="top" style="font-size:14px;line-height:1.8;color:#ffffff;">
                            <strong style="color:#e4af34;text-transform:uppercase;letter-spacing:.12em;font-size:11px;">Contact</strong><br />
                            <a href="mailto:${CONTACT_EMAIL}" style="color:#ffffff;text-decoration:none;">${CONTACT_EMAIL}</a><br />
                            <a href="${PHONE_URL}" style="color:#ffffff;text-decoration:none;">${PHONE_LABEL}</a><br />
                            <a href="${WHATSAPP_URL}" style="color:#ffffff;text-decoration:none;">WhatsApp: ${PHONE_LABEL}</a>
                          </td>
                          <td width="50%" valign="top" style="font-size:14px;line-height:1.8;color:#dce6f6;">
                            <strong style="color:#e4af34;text-transform:uppercase;letter-spacing:.12em;font-size:11px;">Creativa Poeta</strong><br />
                            <a href="${SITE_URL}" style="color:#ffffff;text-decoration:none;">www.creativapoeta.com</a><br />
                            Bruxelles et en ligne<br />
                            Reponses claires, outils utiles, resultats visibles.
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

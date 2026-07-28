interface BrandedEmailOptions {
  preheader?: string;
  title?: string;
  content: string;
}

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
  <body style="margin:0;background:#f3f6fb;color:#071a33;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dfe7f2;box-shadow:0 18px 45px rgba(7,26,51,.08);">
            <tr>
              <td style="background:#071a33;padding:28px 30px;border-bottom:4px solid #eeba2b;">
                <div style="font-size:12px;line-height:1.2;color:#eeba2b;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">Creativa Poeta</div>
                <div style="margin-top:8px;font-size:25px;line-height:1.2;color:#ffffff;font-weight:800;">${escapeHtml(title)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;font-size:16px;line-height:1.65;color:#16243a;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="background:#071a33;padding:26px 30px;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:15px;line-height:1.6;">
                      <strong style="color:#eeba2b;font-size:17px;">Creativa Poeta</strong><br />
                      Services digitaux, visibilité moderne et accompagnement numérique.<br />
                      <a href="mailto:contact@creativapoeta.com" style="color:#ffffff;text-decoration:none;">contact@creativapoeta.com</a><br />
                      <a href="https://wa.me/32473297112" style="color:#ffffff;text-decoration:none;">WhatsApp: +32 473 29 71 12</a>
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

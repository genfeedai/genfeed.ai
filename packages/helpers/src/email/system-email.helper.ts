export interface SystemEmailAction {
  label: string;
  url: string;
}

export interface SystemEmailOptions {
  title: string;
  preheader?: string;
  eyebrow?: string;
  bodyHtml: string;
  action?: SystemEmailAction;
  footerNote?: string;
  appUrl?: string;
}

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const BRAND_NAME = 'Genfeed.ai';

/** The only schemes an outbound email is allowed to link to. */
const SAFE_EMAIL_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Escaping a URL only closes attribute breakout — it leaves `javascript:` and
 * `data:text/html;…` payloads perfectly intact inside an `href`. Several link
 * targets reaching these templates are caller-supplied (workflow review URLs,
 * video job URLs, scraped trend links), so parse the value and keep only the
 * schemes above. Anything else — including a relative or unparseable string —
 * is rejected rather than rendered.
 */
export function sanitizeSystemEmailUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    return SAFE_EMAIL_URL_PROTOCOLS.has(parsed.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

export function escapeSystemEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildSystemEmailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;color:#b4b4bc;font-size:15px;line-height:24px;">${escapeSystemEmailHtml(text)}</p>`;
}

export function buildSystemEmailHtml(input: SystemEmailOptions): string {
  const requestedAppUrl = input.appUrl ?? DEFAULT_APP_URL;
  // An explicit empty string still means "render the brand without a link".
  const appUrl = requestedAppUrl
    ? (sanitizeSystemEmailUrl(requestedAppUrl) ?? DEFAULT_APP_URL)
    : '';
  const brandMark = appUrl
    ? `<a href="${escapeSystemEmailHtml(appUrl)}" style="color:#f4f4f5;font-size:14px;font-weight:700;letter-spacing:0;text-decoration:none;">${BRAND_NAME}</a>`
    : `<span style="color:#f4f4f5;font-size:14px;font-weight:700;letter-spacing:0;">${BRAND_NAME}</span>`;
  const footerLink = appUrl
    ? ` <a href="${escapeSystemEmailHtml(appUrl)}" style="color:#b4b4bc;text-decoration:underline;">Open Genfeed</a>`
    : '';
  const preheader =
    input.preheader ??
    `${input.title} - a secure notification from ${BRAND_NAME}.`;
  const eyebrow = input.eyebrow ?? BRAND_NAME;
  // Fail closed: an action pointing at a scheme we do not trust is dropped
  // rather than rendered, so a poisoned link target cannot ship a button.
  const actionUrl = input.action
    ? sanitizeSystemEmailUrl(input.action.url)
    : null;
  const action =
    input.action && actionUrl
      ? `<tr><td style="padding:8px 32px 24px;"><a href="${escapeSystemEmailHtml(actionUrl)}" style="background:#fafafa;border-radius:8px;color:#050607;display:inline-block;font-size:14px;font-weight:700;line-height:20px;padding:12px 18px;text-decoration:none;">${escapeSystemEmailHtml(input.action.label)}</a></td></tr>`
      : '';
  const footerNote = input.footerNote
    ? `<p style="margin:0 0 12px;color:#8c8c96;font-size:12px;line-height:18px;">${escapeSystemEmailHtml(input.footerNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark light">
    <meta name="supported-color-schemes" content="dark light">
    <title>${escapeSystemEmailHtml(input.title)}</title>
  </head>
  <body style="background:#050607;margin:0;padding:0;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeSystemEmailHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050607;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:600px;width:100%;">
            <tr>
              <td style="padding:0 0 14px;">
                ${brandMark}
              </td>
            </tr>
            <tr>
              <td style="background:#0c0d10;border:1px solid #333538;border-radius:10px;padding:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
                  <tr>
                    <td style="padding:32px 32px 8px;">
                      <div style="color:#6b6b78;font-size:12px;font-weight:700;letter-spacing:.08em;line-height:16px;text-transform:uppercase;">${escapeSystemEmailHtml(eyebrow)}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 32px 14px;">
                      <h1 style="color:#f4f4f5;font-size:24px;font-weight:700;letter-spacing:0;line-height:30px;margin:0;">${escapeSystemEmailHtml(input.title)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#b4b4bc;font-size:15px;line-height:24px;padding:0 32px;">
                      ${input.bodyHtml}
                    </td>
                  </tr>
                  ${action}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 4px 0;">
                ${footerNote}
                <p style="margin:0;color:#6b6b78;font-size:12px;line-height:18px;">This message was sent by ${BRAND_NAME}.${footerLink}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

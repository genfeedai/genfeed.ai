import { cdnAsset } from '../media/cdn/cdn.helper';

export interface SystemEmailAction {
  label: string;
  url: string;
}

export interface SystemEmailOptions {
  title: string;
  preheader?: string;
  bodyHtml: string;
  action?: SystemEmailAction;
  /** Secondary-style button beside the action; dropped without an action. */
  secondaryAction?: SystemEmailAction;
  footerNote?: string;
  /** Rendered in the footer, never in the message body. */
  unsubscribeUrl?: string;
  appUrl?: string;
}

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const BRAND_NAME = 'Genfeed.ai';
// Raster on purpose: Gmail and Outlook do not render SVG. Same mark as the
// sender avatar, a white G on a near-black tile, so it reads in both themes.
const BRAND_LOGO_URL = cdnAsset('/assets/branding/logo.jpg');

// DESIGN.md dark tokens. Email clients cannot read CSS variables, so the
// values are inlined: black canvas, near-black card with the standard border.
const EMAIL_COLORS = {
  border: '#333333',
  canvas: '#000000',
  card: '#0A0A0A',
  primary: '#EDEDED',
  primaryForeground: '#0A0A0A',
  secondary: '#161616',
  textMuted: '#949494',
  textPrimary: '#EDEDED',
  textSecondary: '#A1A1A1',
} as const;

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
  return `<p style="margin:0 0 16px;color:${EMAIL_COLORS.textSecondary};font-size:15px;line-height:24px;">${escapeSystemEmailHtml(text)}</p>`;
}

type EmailButtonVariant = 'primary' | 'secondary';

// 44px tall: the touch-target floor for mail clients on phones. The secondary
// button trades 1px of padding for its border so both buttons match.
const EMAIL_BUTTON_STYLES: Record<EmailButtonVariant, string> = {
  primary: `background:${EMAIL_COLORS.primary};border:1px solid ${EMAIL_COLORS.primary};color:${EMAIL_COLORS.primaryForeground};`,
  secondary: `background:${EMAIL_COLORS.secondary};border:1px solid ${EMAIL_COLORS.border};color:${EMAIL_COLORS.textPrimary};`,
};

function buildEmailButton(
  label: string,
  url: string,
  variant: EmailButtonVariant,
): string {
  return `<a href="${escapeSystemEmailHtml(url)}" style="${EMAIL_BUTTON_STYLES[variant]}border-radius:6px;display:inline-block;font-size:14px;font-weight:600;line-height:20px;margin:0 8px 8px 0;padding:11px 16px;text-decoration:none;">${escapeSystemEmailHtml(label)}</a>`;
}

function buildFooterLink(label: string, url: string): string {
  return `<a href="${escapeSystemEmailHtml(url)}" style="color:${EMAIL_COLORS.textSecondary};text-decoration:underline;">${label}</a>`;
}

export function buildSystemEmailHtml(input: SystemEmailOptions): string {
  const requestedAppUrl = input.appUrl ?? DEFAULT_APP_URL;
  // An explicit empty string still means "render the brand without a link".
  const appUrl = requestedAppUrl
    ? (sanitizeSystemEmailUrl(requestedAppUrl) ?? DEFAULT_APP_URL)
    : '';
  const brandLockup = `<img src="${BRAND_LOGO_URL}" width="32" height="32" alt="" style="border:0;border-radius:6px;display:inline-block;height:32px;outline:none;text-decoration:none;vertical-align:middle;width:32px;"><span style="color:${EMAIL_COLORS.textPrimary};display:inline-block;font-size:15px;font-weight:600;line-height:32px;padding-left:10px;vertical-align:middle;">${BRAND_NAME}</span>`;
  const brandMark = appUrl
    ? `<a href="${escapeSystemEmailHtml(appUrl)}" style="text-decoration:none;">${brandLockup}</a>`
    : brandLockup;
  const preheader =
    input.preheader ??
    `${input.title} - a secure notification from ${BRAND_NAME}.`;
  // Fail closed: an action pointing at a scheme we do not trust is dropped
  // rather than rendered, so a poisoned link target cannot ship a button.
  const actionUrl = input.action
    ? sanitizeSystemEmailUrl(input.action.url)
    : null;
  const secondaryUrl = input.secondaryAction
    ? sanitizeSystemEmailUrl(input.secondaryAction.url)
    : null;
  const buttons =
    input.action && actionUrl
      ? [
          buildEmailButton(input.action.label, actionUrl, 'primary'),
          input.secondaryAction && secondaryUrl
            ? buildEmailButton(
                input.secondaryAction.label,
                secondaryUrl,
                'secondary',
              )
            : '',
        ].join('')
      : null;
  const action = buttons
    ? `<tr><td style="padding:8px 32px 24px;">${buttons}</td></tr>`
    : '<tr><td style="padding:0 0 16px;"></td></tr>';
  // Same rule as the action: a misconfigured unsubscribe URL loses the link,
  // never becomes an arbitrary scheme.
  const unsubscribeUrl = input.unsubscribeUrl
    ? sanitizeSystemEmailUrl(input.unsubscribeUrl)
    : null;
  const footerLinks = [
    appUrl ? buildFooterLink('Open Genfeed', appUrl) : null,
    unsubscribeUrl ? buildFooterLink('Unsubscribe', unsubscribeUrl) : null,
  ].filter((link): link is string => link !== null);
  const footerNote = input.footerNote
    ? `<p style="margin:0 0 8px;color:${EMAIL_COLORS.textMuted};font-size:12px;line-height:18px;">${escapeSystemEmailHtml(input.footerNote)}</p>`
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
  <body style="background:${EMAIL_COLORS.canvas};margin:0;padding:0;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeSystemEmailHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.canvas};border-collapse:collapse;font-family:Satoshi,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:560px;width:100%;">
            <tr>
              <td style="background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:8px;padding:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">
                  <tr>
                    <td style="border-bottom:1px solid ${EMAIL_COLORS.border};padding:20px 32px;">
                      ${brandMark}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:32px 32px 16px;">
                      <h1 style="color:${EMAIL_COLORS.textPrimary};font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:32px;margin:0;">${escapeSystemEmailHtml(input.title)}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:${EMAIL_COLORS.textSecondary};font-size:15px;line-height:24px;padding:0 32px;">
                      ${input.bodyHtml}
                    </td>
                  </tr>
                  ${action}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 16px 0;">
                ${footerNote}
                <p style="margin:0;color:${EMAIL_COLORS.textMuted};font-size:12px;line-height:18px;">Sent by ${BRAND_NAME}${footerLinks.length > 0 ? ` &middot; ${footerLinks.join(' &middot; ')}` : '.'}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

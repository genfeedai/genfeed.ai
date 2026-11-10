import type {
  NewsletterEmailBrand,
  NewsletterEmailContent,
  NewsletterEmailFooter,
  NewsletterEmailTemplate,
  NewsletterRecipientLinks,
} from '@api/collections/newsletter-sends/interfaces/newsletter-email.interface';
import {
  escapeSystemEmailHtml,
  sanitizeSystemEmailUrl,
} from '@helpers/email/system-email.helper';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HREF_PATTERN = /href="([^"]*)"/g;
const LINK_PLACEHOLDER_PATTERN = /\{\{link:(\d+)\}\}/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g;
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/gm;
const MARKDOWN_EMPHASIS_PATTERN = /(\*\*|__|\*|_|~~|`)/g;
const MARKDOWN_QUOTE_PATTERN = /^>\s?/gm;
const MARKDOWN_RULE_PATTERN = /^(?:-{3,}|\*{3,}|_{3,})\s*$/gm;
const EXCESS_BLANK_LINES_PATTERN = /\n{3,}/g;
const PARAGRAPH_SPLIT_PATTERN = /\n\s*\n/;

export const UNSUBSCRIBE_PLACEHOLDER = '{{unsubscribeUrl}}';

/** Web-safe stack: mail clients do not load brand web fonts reliably. */
const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const DEFAULT_PRIMARY = '#111111';
const DEFAULT_CANVAS = '#F4F4F5';
const CARD_BACKGROUND = '#FFFFFF';
const TEXT_PRIMARY = '#18181B';
const TEXT_MUTED = '#71717A';
const BORDER = '#E4E4E7';

function safeColor(value: string | null | undefined, fallback: string): string {
  return value && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : fallback;
}

/** Black or white text, whichever reads on the given background. */
function readableTextOn(hex: string): string {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const red = Number.parseInt(full.slice(1, 3), 16);
  const green = Number.parseInt(full.slice(3, 5), 16);
  const blue = Number.parseInt(full.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.6 ? '#111111' : '#FFFFFF';
}

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = sanitizeSystemEmailUrl(value);
  return url && !url.startsWith('mailto:') ? url : null;
}

/**
 * Replace every outbound http(s) link in the body with a `{{link:N}}`
 * placeholder so each recipient gets a first-party tracked redirect. The
 * collected destinations are stored on the send; the redirect only ever
 * resolves one of them, never a caller-supplied URL.
 */
export function extractTrackedLinks(bodyHtml: string): {
  html: string;
  links: string[];
} {
  const links: string[] = [];
  const html = bodyHtml.replace(HREF_PATTERN, (match, raw: string) => {
    const url = safeUrl(raw.replaceAll('&amp;', '&'));
    if (!url) return match;
    let index = links.indexOf(url);
    if (index === -1) {
      links.push(url);
      index = links.length - 1;
    }
    return `href="{{link:${index}}}"`;
  });
  return { html, links };
}

/** Plain-text alternative from the issue's Markdown source. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(MARKDOWN_IMAGE_PATTERN, '')
    .replace(MARKDOWN_LINK_PATTERN, '$1 ($2)')
    .replace(MARKDOWN_HEADING_PATTERN, '')
    .replace(MARKDOWN_QUOTE_PATTERN, '')
    .replace(MARKDOWN_RULE_PATTERN, '')
    .replace(MARKDOWN_EMPHASIS_PATTERN, '')
    .replace(EXCESS_BLANK_LINES_PATTERN, '\n\n')
    .trim();
}

/**
 * The free preview of a gated issue (#9718): its first paragraphs, up to
 * roughly `maxCharacters`, always cut on a paragraph boundary.
 */
export function previewMarkdown(markdown: string, maxCharacters = 600): string {
  const paragraphs = markdown.trim().split(PARAGRAPH_SPLIT_PATTERN);
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    if (kept.length > 0 && length + paragraph.length > maxCharacters) break;
    kept.push(paragraph);
    length += paragraph.length;
  }
  return kept.join('\n\n');
}

function footerHtml(
  footer: NewsletterEmailFooter,
  webUrl: string | null,
  isWebVersion: boolean,
): string {
  const muted = `color:${TEXT_MUTED};font-size:12px;line-height:18px;`;
  const lines: string[] = [];
  const sender = footer.senderName?.trim();
  if (sender) {
    lines.push(
      `<p style="margin:0 0 6px;${muted}">${escapeSystemEmailHtml(sender)}</p>`,
    );
  }
  const address = footer.postalAddress?.trim();
  if (address) {
    lines.push(
      `<p style="margin:0 0 6px;${muted}">${escapeSystemEmailHtml(address)}</p>`,
    );
  }
  const note = footer.footerText?.trim();
  if (note) {
    lines.push(
      `<p style="margin:0 0 6px;${muted}">${escapeSystemEmailHtml(note)}</p>`,
    );
  }
  if (!isWebVersion) {
    const links = [
      `<a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:${TEXT_MUTED};text-decoration:underline;">Unsubscribe</a>`,
    ];
    if (webUrl) {
      links.push(
        `<a href="${escapeSystemEmailHtml(webUrl)}" style="color:${TEXT_MUTED};text-decoration:underline;">View in browser</a>`,
      );
    }
    lines.push(
      `<p style="margin:12px 0 0;${muted}">${links.join(' &middot; ')}</p>`,
    );
  }
  const attribution = safeUrl(footer.attributionUrl);
  if (footer.isAttributionEnabled && attribution) {
    lines.push(
      `<p style="margin:12px 0 0;${muted}"><a href="${escapeSystemEmailHtml(attribution)}" style="color:${TEXT_MUTED};text-decoration:none;">Sent with Genfeed</a></p>`,
    );
  }
  return lines.join('');
}

function footerText(
  footer: NewsletterEmailFooter,
  webUrl: string | null,
): string {
  const lines = [
    footer.senderName?.trim(),
    footer.postalAddress?.trim(),
    footer.footerText?.trim(),
    webUrl ? `View in browser: ${webUrl}` : undefined,
    `Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
    footer.isAttributionEnabled ? 'Sent with Genfeed' : undefined,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * One table-based, inline-styled layout for every newsletter email (#9725):
 * brand header with logo, optional banner, title, body, call to action and a
 * compliant footer. Brand values fall back to safe defaults when missing.
 */
export function renderNewsletterEmail(
  brand: NewsletterEmailBrand,
  content: NewsletterEmailContent,
  footer: NewsletterEmailFooter,
): NewsletterEmailTemplate {
  const primary = safeColor(brand.primaryColor, DEFAULT_PRIMARY);
  const onPrimary = readableTextOn(primary);
  const canvas = safeColor(brand.backgroundColor, DEFAULT_CANVAS);
  const brandName = escapeSystemEmailHtml(brand.label.trim() || 'Newsletter');
  const title = escapeSystemEmailHtml(content.title);
  const logoUrl = safeUrl(brand.logoUrl);
  const bannerUrl = safeUrl(brand.bannerUrl);
  const webUrl = safeUrl(content.webUrl);
  const ctaUrl = content.cta ? safeUrl(content.cta.url) : null;
  const tracked = extractTrackedLinks(content.bodyHtml);
  const summary = content.summary?.trim();

  const logo = logoUrl
    ? `<img src="${escapeSystemEmailHtml(logoUrl)}" alt="${brandName}" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:8px;object-fit:cover;border:0;">`
    : '';
  const header = `<tr><td style="padding:20px 32px;border-bottom:1px solid ${BORDER};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${logo ? `<td style="padding-right:12px;vertical-align:middle;">${logo}</td>` : ''}
<td style="vertical-align:middle;font-size:16px;font-weight:700;color:${TEXT_PRIMARY};">${brandName}</td>
</tr></table></td></tr>`;
  const banner = bannerUrl
    ? `<tr><td style="padding:0;"><img src="${escapeSystemEmailHtml(bannerUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`
    : '';
  const cta =
    content.cta && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:8px;background:${primary};"><a href="${escapeSystemEmailHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:${onPrimary};text-decoration:none;border-radius:8px;">${escapeSystemEmailHtml(content.cta.label)}</a></td></tr></table>`
      : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
<style>
.gf-body p{margin:0 0 16px;}
.gf-body h1,.gf-body h2,.gf-body h3{color:${TEXT_PRIMARY};line-height:1.25;margin:28px 0 12px;}
.gf-body a{color:${onPrimary === '#FFFFFF' ? primary : TEXT_PRIMARY};}
.gf-body img{max-width:100%;height:auto;}
.gf-body blockquote{margin:0 0 16px;padding:0 0 0 16px;border-left:3px solid ${BORDER};color:${TEXT_MUTED};}
.gf-body pre{white-space:pre-wrap;background:${DEFAULT_CANVAS};padding:12px;border-radius:6px;}
@media (max-width:620px){.gf-pad{padding-left:20px !important;padding-right:20px !important;}}
</style>
</head>
<body style="margin:0;padding:0;background:${canvas};">
${summary ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeSystemEmailHtml(summary)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${CARD_BACKGROUND};border:1px solid ${BORDER};border-radius:12px;overflow:hidden;font-family:${EMAIL_FONT_STACK};">
${header}
${banner}
<tr><td class="gf-pad" style="padding:32px;">
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:${TEXT_PRIMARY};">${title}</h1>
<div class="gf-body" style="font-size:16px;line-height:1.65;color:${TEXT_PRIMARY};">${tracked.html}</div>
${cta}
</td></tr>
<tr><td class="gf-pad" style="padding:20px 32px 28px;border-top:1px solid ${BORDER};text-align:center;">${footerHtml(footer, webUrl, content.isWebVersion === true)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textParts = [content.title, '', content.bodyText];
  if (content.cta && ctaUrl) {
    textParts.push('', `${content.cta.label}: ${ctaUrl}`);
  }
  textParts.push('', '---', footerText(footer, webUrl));

  return { html, links: tracked.links, text: textParts.join('\n') };
}

/** Fill one recipient's unsubscribe and tracked-link placeholders. */
export function personalizeNewsletterEmail(
  template: Pick<NewsletterEmailTemplate, 'html' | 'text'>,
  links: NewsletterRecipientLinks,
): { html: string; text: string } {
  const unsubscribe = escapeSystemEmailHtml(links.unsubscribeUrl);
  return {
    html: template.html
      .replaceAll(UNSUBSCRIBE_PLACEHOLDER, unsubscribe)
      .replace(LINK_PLACEHOLDER_PATTERN, (_match, index: string) =>
        escapeSystemEmailHtml(links.linkUrl(Number(index))),
      ),
    text: template.text.replaceAll(
      UNSUBSCRIBE_PLACEHOLDER,
      links.unsubscribeUrl,
    ),
  };
}

const BLOCKED_CONTENT_TAGS = [
  'base',
  'embed',
  'iframe',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'style',
  'svg',
  'template',
] as const;

const BLOCKED_CONTENT_TAG_PATTERN = new RegExp(
  `<\\s*(${BLOCKED_CONTENT_TAGS.join('|')})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`,
  'gi',
);
const BLOCKED_TAG_PATTERN = new RegExp(
  `<\\/?\\s*(?:${BLOCKED_CONTENT_TAGS.join('|')})\\b[^>]*>`,
  'gi',
);
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const ATTRIBUTE_PATTERN =
  /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;

const BLOCKED_ATTRIBUTES = new Set(['srcdoc', 'style']);
const URL_ATTRIBUTES = new Set([
  'action',
  'formaction',
  'href',
  'poster',
  'src',
  'srcset',
  'xlink:href',
]);

function decodeHtmlControlEntities(value: string): string {
  return value
    .replace(/&colon;/gi, ':')
    .replace(/&newline;|&tab;/gi, '')
    .replace(/&#(x[0-9a-f]+|\d+);?/gi, (match, code: string) => {
      const isHex = code.toLowerCase().startsWith('x');
      const rawCodePoint = isHex ? code.slice(1) : code;
      const codePoint = Number.parseInt(rawCodePoint, isHex ? 16 : 10);

      if (!Number.isFinite(codePoint)) {
        return match;
      }

      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    });
}

function unquoteAttributeValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function stripUrlSpacing(value: string): string {
  let normalized = '';

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (codePoint <= 0x20 || codePoint === 0x7f || char.trim() === '') {
      continue;
    }

    normalized += char;
  }

  return normalized;
}

function isUnsafeUrlValue(value: string): boolean {
  const normalized = stripUrlSpacing(
    decodeHtmlControlEntities(unquoteAttributeValue(value)),
  ).toLowerCase();

  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:')
  );
}

function stripUnsafeAttributes(html: string): string {
  return html.replace(
    ATTRIBUTE_PATTERN,
    (match, rawName: string, rawValue: string) => {
      const name = rawName.toLowerCase();

      if (name.startsWith('on') || BLOCKED_ATTRIBUTES.has(name)) {
        return '';
      }

      if (URL_ATTRIBUTES.has(name) && isUnsafeUrlValue(rawValue)) {
        return '';
      }

      return match;
    },
  );
}

/**
 * Sanitize HTML without loading browser emulation in server-rendered routes.
 */
export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }

  return stripUnsafeAttributes(
    html
      .replace(HTML_COMMENT_PATTERN, '')
      .replace(BLOCKED_CONTENT_TAG_PATTERN, '')
      .replace(BLOCKED_TAG_PATTERN, ''),
  );
}

/**
 * Safe wrapper for dangerouslySetInnerHTML.
 */
export function createMarkup(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

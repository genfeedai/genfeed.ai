const AMPERSANDS_PATTERN = /&/g;
const LESS_THAN_SIGNS_PATTERN = /</g;
const GREATER_THAN_SIGNS_PATTERN = />/g;
const DOUBLE_QUOTES_PATTERN = /"/g;
const SINGLE_QUOTES_PATTERN = /'/g;
const SLASHES_PATTERN = /\//g;

/**
 * Escapes `&`, `<` and `>`. Safe for HTML text nodes only; use
 * {@link escapeHtml} for anything that can land inside an attribute.
 */
export function escapeHtmlText(value: string): string {
  return value
    .replace(AMPERSANDS_PATTERN, '&amp;')
    .replace(LESS_THAN_SIGNS_PATTERN, '&lt;')
    .replace(GREATER_THAN_SIGNS_PATTERN, '&gt;');
}

/**
 * Escapes `&`, `<`, `>`, `"` and `'`. Safe for HTML text nodes and for
 * quoted attribute values.
 */
export function escapeHtml(value: string): string {
  return escapeHtmlText(value)
    .replace(DOUBLE_QUOTES_PATTERN, '&quot;')
    .replace(SINGLE_QUOTES_PATTERN, '&#39;');
}

/**
 * OWASP-style escaping used when user input is stored already encoded: the
 * {@link escapeHtml} set plus `/`, with the apostrophe written as `&#x27;`.
 */
export function escapeHtmlStrict(value: string): string {
  return escapeHtmlText(value)
    .replace(DOUBLE_QUOTES_PATTERN, '&quot;')
    .replace(SINGLE_QUOTES_PATTERN, '&#x27;')
    .replace(SLASHES_PATTERN, '&#x2F;');
}

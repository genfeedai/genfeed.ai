const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/**
 * Absolute http(s) URLs in a post caption, in first-seen order and without
 * duplicates. Trailing sentence punctuation is not part of the URL.
 */
export function extractPostUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '');
    if (url) urls.add(url);
  }
  return [...urls];
}

/**
 * Replace each URL in `text` with its entry in `replacements`; URLs without an
 * entry stay as written. Trailing punctuation after a URL is preserved.
 */
export function replacePostUrls(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  return text.replace(URL_PATTERN, (matched) => {
    const url = matched.replace(TRAILING_PUNCTUATION, '');
    const replacement = replacements.get(url);
    return replacement ? replacement + matched.slice(url.length) : matched;
  });
}

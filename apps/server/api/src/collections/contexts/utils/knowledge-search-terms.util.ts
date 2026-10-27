/** Terms looked up verbatim in a passage; more would turn an exact match into a loose one. */
export const MAX_EXACT_TERMS = 8;
const MAX_TERM_LENGTH = 80;
const MIN_TERM_LENGTH = 2;

const STOP_WORDS = new Set([
  'about',
  'also',
  'and',
  'are',
  'brand',
  'but',
  'can',
  'could',
  'describe',
  'did',
  'does',
  'explain',
  'find',
  'for',
  'give',
  'how',
  'list',
  'our',
  'please',
  'show',
  'should',
  'summarize',
  'tell',
  'that',
  'the',
  'this',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'will',
  'would',
  'you',
  'your',
]);

const QUOTED = /["“]([^"”]{2,80})["”]/gu;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function isDistinctive(token: string): boolean {
  const hasDigit = /\p{N}/u.test(token);
  const hasLetter = /\p{L}/u.test(token);
  // Product codes and versions: "Zephyr-9", "v2.1", "SKU123".
  if (hasDigit && (hasLetter || token.length >= 4)) return true;
  if (/[\p{L}\p{N}][-_.][\p{L}\p{N}]/u.test(token)) return true;
  // CamelCase and ALL-CAPS names: "GenFeed", "NASA".
  if (/\p{Ll}\p{Lu}/u.test(token)) return true;
  if (token.length >= 3 && token === token.toUpperCase() && hasLetter)
    return !STOP_WORDS.has(token.toLowerCase());
  // Capitalised names: "Summer", "Zephyr".
  return (
    token.length >= 3 &&
    /^\p{Lu}/u.test(token) &&
    !STOP_WORDS.has(token.toLowerCase())
  );
}

/**
 * The exact names in a search query: quoted phrases plus tokens that look like
 * a name or code (product codes, versions, capitalised or CamelCase names).
 * A passage that contains one of them is returned even when its vector
 * similarity is below the threshold, so an exact product or campaign name is
 * not lost to semantic ranking.
 */
export function extractExactTerms(query: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const term = raw.replace(EDGE_PUNCTUATION, '').trim();
    const key = term.toLowerCase();
    if (
      term.length < MIN_TERM_LENGTH ||
      term.length > MAX_TERM_LENGTH ||
      seen.has(key) ||
      terms.length >= MAX_EXACT_TERMS
    ) {
      return;
    }
    seen.add(key);
    terms.push(term);
  };

  for (const match of query.matchAll(QUOTED)) add(match[1] ?? '');
  const unquoted = query.replace(QUOTED, ' ');
  for (const token of unquoted.split(/\s+/u)) {
    const trimmed = token.replace(EDGE_PUNCTUATION, '');
    if (trimmed && isDistinctive(trimmed)) add(trimmed);
  }
  return terms;
}

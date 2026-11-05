const WHITESPACE_RUNS_PATTERN = /\s+/g;

const EXCERPT_LENGTH = 160;

export function toExcerpt(text: string): string {
  const flattened = text.replace(WHITESPACE_RUNS_PATTERN, ' ').trim();
  return flattened.length > EXCERPT_LENGTH
    ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : flattened;
}

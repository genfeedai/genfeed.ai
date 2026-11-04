const EXCERPT_LENGTH = 160;

export function toExcerpt(text: string): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  return flattened.length > EXCERPT_LENGTH
    ? `${flattened.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : flattened;
}

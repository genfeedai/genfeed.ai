const JSON_ARRAY_PATTERN = /\[[\s\S]*\]/;
const LEADING_HEADING_MARKER_PATTERN = /^#\s*/;

/** Parses the first JSON array in an LLM reply, or [] when it is not an array. */
export function parseJsonArray<T>(value: string): T[] {
  const match = value.match(JSON_ARRAY_PATTERN);
  const json = match?.[0] ?? value;
  const parsed = JSON.parse(json) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

/** Uses the draft's first line (without a leading `#`) as its title. */
export function resolveDraftTitle(topic: string, draftContent: string): string {
  const firstLine = draftContent
    .split('\n')[0]
    ?.replace(LEADING_HEADING_MARKER_PATTERN, '')
    .trim();
  return firstLine || topic;
}

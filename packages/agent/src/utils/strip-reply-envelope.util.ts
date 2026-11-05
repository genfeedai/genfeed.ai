const REPLY_ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  'content',
  'explanation',
  'steps',
  'summary',
  'title',
]);
const MAX_ENVELOPE_START_ATTEMPTS = 25;

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isReplyEnvelope(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).every((key) => REPLY_ENVELOPE_KEYS.has(key)) &&
    (typeof record.content === 'string' || Array.isArray(record.steps))
  );
}

/**
 * A reply the planner or title prompt answered with a sentence and then its
 * JSON envelope ({"title", "summary", "content", "steps"}) would show the
 * braces to the reader. This returns the sentence and the envelope's own
 * `content`, and leaves any other text, including JSON the user asked for,
 * exactly as it came.
 */
export function stripTrailingReplyEnvelope(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.endsWith('}')) {
    return content;
  }

  let attempts = 0;
  for (
    let start = trimmed.indexOf('{');
    start !== -1 && attempts < MAX_ENVELOPE_START_ATTEMPTS;
    start = trimmed.indexOf('{', start + 1)
  ) {
    attempts += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed.slice(start));
    } catch {
      continue;
    }
    if (!isReplyEnvelope(parsed)) {
      return content;
    }
    const prose = trimmed.slice(0, start).trim();
    const inner =
      readText(parsed.content) ||
      readText(parsed.summary) ||
      readText(parsed.explanation);
    const text = [...new Set([prose, inner].filter(Boolean))].join('\n\n');
    return text || content;
  }

  return content;
}

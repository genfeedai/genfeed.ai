import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';

const WHITESPACE_RUN_PATTERN = /\s+/;
const PARAGRAPH_BREAK_PATTERN = /\n{2,}/;
const SENTENCES_PATTERN = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;

/** X's per-post character limit. Long-form posts lift it; threads do not. */
export const X_POST_CHAR_LIMIT = 280;

function fits(text: string, limit: number): boolean {
  return calculateTweetLength(text) <= limit;
}

function splitWords(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const word of text.split(WHITESPACE_RUN_PATTERN).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate, limit)) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
    }
    // A single token longer than the limit is hard-cut so no chunk overflows.
    let rest = word;
    while (!fits(rest, limit)) {
      chunks.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    current = rest;
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Split plain text into thread items that each fit one X post. Paragraph
 * breaks and sentence ends are preferred cut points; words are the fallback.
 */
export function splitTextIntoThread(
  text: string,
  limit: number = X_POST_CHAR_LIMIT,
): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const units = normalized
    .split(PARAGRAPH_BREAK_PATTERN)
    .flatMap((paragraph) => paragraph.match(SENTENCES_PATTERN) ?? [paragraph])
    .map((unit) => unit.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const unit of units) {
    if (!fits(unit, limit)) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(...splitWords(unit, limit));
      continue;
    }
    const candidate = current ? `${current} ${unit}` : unit;
    if (fits(candidate, limit)) {
      current = candidate;
    } else {
      chunks.push(current);
      current = unit;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

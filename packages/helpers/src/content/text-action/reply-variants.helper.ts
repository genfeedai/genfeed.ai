import {
  measureChannelText,
  type TextActionGate,
  type TextActionRejection,
} from './text-action-text.helper';

/** A line holding only this separates the variants in the model answer and in the saved artifact. */
const VARIANT_SEPARATOR = /^[ \t]*-{3,}[ \t]*$/mu;
const VARIANT_JOINER = '\n---\n';
const LEADING_LIST_MARKER = /^\s*(?:\d{1,2}[.)]|[-*•])\s+/u;
const WRAPPING_QUOTES = /^["“”'‘’`]+|["“”'‘’`]+$/gu;
const ELLIPSIS = '…';
const SENTENCE_END = /[.!?](?=\s|$)/gu;

function cleanVariant(value: string): string {
  return value
    .replace(/<\/?post>/giu, '')
    .trim()
    .replace(LEADING_LIST_MARKER, '')
    .replace(WRAPPING_QUOTES, '')
    .trim();
}

/** The variants a model answer holds, in order, without numbering, quotes or empties. */
export function parseReplyVariants(raw: string): string[] {
  return raw
    .split(VARIANT_SEPARATOR)
    .map(cleanVariant)
    .filter((variant) => variant.length > 0);
}

/** The variants of a saved artifact written by {@link joinReplyVariants}. */
export function splitReplyVariants(saved: string): string[] {
  return saved
    .split(VARIANT_SEPARATOR)
    .map((variant) => variant.trim())
    .filter((variant) => variant.length > 0);
}

export function joinReplyVariants(variants: readonly string[]): string {
  return variants.join(VARIANT_JOINER);
}

function comparisonKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** True when two replies say the same thing: equal once case and punctuation are ignored, or one is the other's start. */
function isSameReply(a: string, b: string): boolean {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  return left === right || left.startsWith(right) || right.startsWith(left);
}

/**
 * Cuts a reply to fit: at the last sentence end that keeps at least a third of
 * the room, else at the last word, with an ellipsis. Never splits inside a
 * word unless a single word is longer than the whole limit.
 */
export function truncateToChannelLimit(
  text: string,
  maxCharacters: number,
  usesWeightedCharacters: boolean,
): string {
  const fits = (value: string) =>
    measureChannelText(value, usesWeightedCharacters) <= maxCharacters;
  if (fits(text)) return text;
  // Every character weighs at least one, so nothing past `maxCharacters` can fit.
  let candidate = text.slice(0, maxCharacters);
  while (candidate.length > 0 && !fits(candidate)) {
    candidate = candidate.slice(0, -1);
  }
  const ends = Array.from(
    candidate.matchAll(SENTENCE_END),
    (match) => (match.index ?? 0) + 1,
  );
  const sentenceEnd = ends.at(-1);
  if (sentenceEnd !== undefined && sentenceEnd >= candidate.length / 3) {
    return candidate.slice(0, sentenceEnd).trim();
  }
  const lastSpace = candidate.lastIndexOf(' ');
  let cut = lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate;
  cut = cut.replace(/[\s,;:\-–—]+$/u, '');
  while (cut.length > 0 && !fits(`${cut}${ELLIPSIS}`)) {
    cut = cut.slice(0, -1);
  }
  return cut.length > 0 ? `${cut}${ELLIPSIS}` : '';
}

/**
 * Gate for reply options: split the answer, cut each reply to the platform
 * limit, drop repeats, keep at most `maxVariants`. At least one distinct reply
 * must survive.
 */
export function createReplyVariantsGate(input: {
  maxCharacters: number;
  maxVariants: number;
  usesWeightedCharacters: boolean;
}): TextActionGate {
  let reason: TextActionRejection | null = null;
  return {
    normalize: (raw) => {
      const kept: string[] = [];
      for (const variant of parseReplyVariants(raw)) {
        const fitted = truncateToChannelLimit(
          variant,
          input.maxCharacters,
          input.usesWeightedCharacters,
        );
        if (fitted && !kept.some((existing) => isSameReply(existing, fitted))) {
          kept.push(fitted);
        }
        if (kept.length === input.maxVariants) break;
      }
      if (kept.length === 0) {
        reason = 'empty';
        return null;
      }
      return joinReplyVariants(kept);
    },
    rejection: () => reason,
  };
}

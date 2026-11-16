/**
 * The cheapest text check: is this output a post at all. The onboarding audit
 * found 61% of first drafts came back at about 9 tokens, saved and shown as the
 * user's posts because nothing checked them. Heuristic limits, not calibrated.
 */

import type { DeterministicCheck } from '../rows';

/** Under this a text cannot be a post; 9 tokens is about 35 characters. */
export const MIN_POST_CHARACTERS = 40;
export const MIN_REPLY_CHARACTERS = 20;
export const MIN_POST_WORDS = 5;

const REFUSAL_PATTERN =
  /\b(i can(?:'|’)?not|i can(?:'|’)t|i(?:'|’)m unable|i am unable|i(?:'|’)m sorry|as an ai|i don(?:'|’)t have enough)\b/i;
const COMMENTARY_PATTERN =
  /^(?:(?:sure|certainly|of course)[,!.]|here(?:'s| is) (?:a|an|the|your) (?:post|draft|caption|tweet|thread|script)\b)/i;

export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

export function checkIsPost(
  text: string,
  options: { contentKind: string },
): DeterministicCheck {
  const trimmed = text.trim();
  const minCharacters =
    options.contentKind === 'reply'
      ? MIN_REPLY_CHARACTERS
      : MIN_POST_CHARACTERS;
  const length = [...trimmed].length;
  const wordCount = wordsOf(trimmed).length;

  let problem: string | null = null;
  if (length < minCharacters) {
    problem = `${length} characters, at least ${minCharacters} needed`;
  } else if (wordCount < MIN_POST_WORDS) {
    problem = `${wordCount} words, at least ${MIN_POST_WORDS} needed`;
  } else if (REFUSAL_PATTERN.test(trimmed)) {
    problem = 'reads as a refusal';
  } else if (COMMENTARY_PATTERN.test(trimmed)) {
    problem = 'starts with commentary about the post';
  }

  return {
    detail: problem ?? `${length} characters, ${wordCount} words`,
    id: 'is-a-post',
    passed: problem === null,
  };
}

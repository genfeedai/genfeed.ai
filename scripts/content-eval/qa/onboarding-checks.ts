/**
 * Deterministic checks for onboarding outputs, from the onboarding output
 * audit. Word-overlap thresholds are first guesses, not calibrated: a failure
 * is a prompt to look, and the thresholds change only with evidence.
 */

import type { DeterministicCheck } from '../rows';
import { wordsOf } from './post-shape';

/** Values the product saves silently when voice analysis fails. */
export const GENERIC_VOICE_VALUES: readonly string[] = [
  'professional',
  'friendly and informative',
  'general audience',
];

export const X_MAX_CHARACTERS = 280;

/**
 * Smallest draft the product itself will save per channel: `MIN_DRAFT_CHARACTERS`
 * in `onboarding-draft-brief.util.ts` on the genfeedai/genfeed.ai#10106 branch
 * (read there; not on master when this was written, so re-check after merge).
 * A shorter draft on screen means the product's own guard did not run.
 */
export const ONBOARDING_MIN_CHARACTERS: Readonly<Record<string, number>> = {
  'instagram-draft': 80,
  'linkedin-draft': 200,
  'tiktok-draft': 60,
  'x-draft': 60,
};
/** Share of a draft's words that may repeat the X draft before it is a rewrite. */
export const MAX_REWRITE_SIMILARITY = 0.6;
/** Share of the long draft's content words a shortened one must keep. */
export const MIN_KEPT_IDEA = 0.5;

const MIN_SIGNIFICANT_LENGTH = 5;

function normalize(text: string): string {
  return wordsOf(text).join(' ');
}

function significantWords(text: string): Set<string> {
  return new Set(
    wordsOf(text).filter((word) => word.length >= MIN_SIGNIFICANT_LENGTH),
  );
}

function share(part: Set<string>, whole: Set<string>): number {
  if (whole.size === 0) return 0;
  let kept = 0;
  for (const word of whole) if (part.has(word)) kept += 1;
  return kept / whole.size;
}

export function checkScanHasFacts(savedFacts: string[]): DeterministicCheck {
  return {
    detail: `${savedFacts.length} saved facts or offers`,
    id: 'scan-has-facts',
    passed: savedFacts.length > 0,
  };
}

/** Every saved fact appears on the scanned page, after lowercasing and trimming punctuation. */
export function checkFactsOnPage(
  savedFacts: string[],
  pageText: string,
): DeterministicCheck {
  const page = ` ${normalize(pageText)} `;
  const missing = savedFacts.filter(
    (fact) => !page.includes(` ${normalize(fact)} `),
  );
  return {
    detail:
      missing.length === 0
        ? `${savedFacts.length} of ${savedFacts.length} found on the page`
        : `${missing.length} of ${savedFacts.length} not found on the page`,
    id: 'scan-facts-on-page',
    passed: savedFacts.length > 0 && missing.length === 0,
  };
}

export function checkVoiceIsSpecific(voice: {
  audience: string;
  style: string;
  tone: string;
}): DeterministicCheck {
  const generic = [voice.tone, voice.style, voice.audience].filter((value) =>
    GENERIC_VOICE_VALUES.includes(normalize(value)),
  );
  return {
    detail:
      generic.length === 0
        ? 'no generic fallback value'
        : `${generic.length} of 3 fields are the generic fallback`,
    id: 'voice-not-generic',
    passed: generic.length === 0,
  };
}

export function checkMeetsChannelMinimum(
  text: string,
  output: string,
): DeterministicCheck | null {
  const min = ONBOARDING_MIN_CHARACTERS[output];
  if (min === undefined) return null;
  const length = [...text.trim()].length;
  return {
    detail: `${length}/${min} minimum characters for the channel`,
    id: 'draft-meets-channel-minimum',
    passed: length >= min,
  };
}

export function checkWithinCharacters(
  text: string,
  max: number,
): DeterministicCheck {
  const length = [...text.trim()].length;
  return {
    detail: `${length}/${max} characters`,
    id: 'draft-within-length',
    passed: length <= max,
  };
}

/** The draft names the brand or shares a saved fact's words, so it is not generic. */
export function checkNamesBrandContext(
  text: string,
  brandName: string | undefined,
  savedFacts: string[],
): DeterministicCheck {
  const words = new Set(wordsOf(text));
  const factWords = significantWords(savedFacts.join(' '));
  const sharedFacts = [...factWords].filter((word) => words.has(word));
  const namesBrand =
    brandName !== undefined && normalize(text).includes(normalize(brandName));
  return {
    detail: `${namesBrand ? 'names the brand; ' : ''}${sharedFacts.length} saved-fact words used`,
    id: 'draft-names-brand-context',
    passed: sharedFacts.length >= 2 || (namesBrand && sharedFacts.length >= 1),
  };
}

/** A platform draft is its own post, not the X draft reworded. */
export function checkNotRewriteOf(
  draft: string,
  xDraft: string,
): DeterministicCheck {
  const draftWords = significantWords(draft);
  const similarity = share(significantWords(xDraft), draftWords);
  return {
    detail: `${Math.round(similarity * 100)}% of its words repeat the X draft`,
    id: 'draft-not-x-rewrite',
    passed: similarity < MAX_REWRITE_SIMILARITY,
  };
}

/** The shortened draft is shorter, within the limit, and keeps the idea. */
export function checkShortenKeepsIdea(
  output: string,
  input: string,
  max: number,
): DeterministicCheck {
  const outputLength = [...output.trim()].length;
  const kept = share(significantWords(output), significantWords(input));
  const problems = [
    outputLength > max ? `${outputLength} characters, over ${max}` : null,
    outputLength >= [...input.trim()].length
      ? 'not shorter than the input'
      : null,
    kept < MIN_KEPT_IDEA
      ? `keeps ${Math.round(kept * 100)}% of the input's words`
      : null,
  ].filter((problem): problem is string => problem !== null);
  return {
    detail:
      problems.length === 0
        ? `${outputLength} characters, keeps ${Math.round(kept * 100)}% of the input's words`
        : problems.join('; '),
    id: 'shorten-keeps-idea',
    passed: problems.length === 0,
  };
}

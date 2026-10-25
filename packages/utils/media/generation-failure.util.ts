export type GenerationFailureReason =
  | 'copyright'
  | 'contentPolicy'
  | 'credits'
  | 'generic'
  | 'rateLimit'
  | 'timeout'
  | 'unavailable';

/** Ordered: the first match wins, so the most specific cause comes first. */
const FAILURE_REASON_PATTERNS: ReadonlyArray<
  readonly [GenerationFailureReason, RegExp]
> = [
  ['copyright', /copyright|trademark|intellectual property/i],
  [
    'contentPolicy',
    /content policy|safety|nsfw|moderation|sensitive content|flagged|content.*(?:blocked|rejected|filter)/i,
  ],
  [
    'credits',
    /insufficient (?:credit|fund|balance)|out of credits|quota exceeded/i,
  ],
  ['rateLimit', /rate limit|too many requests|\b429\b/i],
  ['timeout', /timed? ?out|deadline exceeded|\b504\b/i],
  [
    'unavailable',
    /unavailable|overloaded|bad gateway|service error|\b50[023]\b/i,
  ],
];

/**
 * Provider failures arrive as raw free text, often with a stack of nested
 * prefixes and request ids. This names the cause so a card can lead with a
 * short reason; the raw text stays available to the caller untouched.
 */
export function classifyGenerationFailure(
  rawError: string | null | undefined,
): GenerationFailureReason {
  const text = rawError?.trim();
  if (!text) return 'generic';

  for (const [reason, pattern] of FAILURE_REASON_PATTERNS) {
    if (pattern.test(text)) return reason;
  }

  return 'generic';
}

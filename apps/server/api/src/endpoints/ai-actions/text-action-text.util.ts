import { parseTweet } from 'twitter-text';

const MENTION_PATTERN = /(?<![\w@])@\w+/gu;
const HASHTAG_PATTERN = /(?<![\w#])#[\p{L}\p{N}_]+/gu;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const URL_TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/u;

export type ProtectedTokenKind = 'mention' | 'hashtag' | 'link';

export interface ProtectedTokens {
  hashtags: string[];
  links: string[];
  mentions: string[];
}

/** Length as the channel counts it: X weights characters, the others count them. */
export function measureChannelText(
  text: string,
  usesWeightedCharacters: boolean,
): number {
  return usesWeightedCharacters ? parseTweet(text).weightedLength : text.length;
}

export function extractProtectedTokens(text: string): ProtectedTokens {
  return {
    hashtags: text.match(HASHTAG_PATTERN) ?? [],
    links: (text.match(URL_PATTERN) ?? []).map((link) =>
      link.replace(URL_TRAILING_PUNCTUATION, ''),
    ),
    mentions: text.match(MENTION_PATTERN) ?? [],
  };
}

function missingFrom(source: readonly string[], output: readonly string[]) {
  const remaining = new Map<string, number>();
  for (const token of output) {
    remaining.set(token, (remaining.get(token) ?? 0) + 1);
  }
  const missing: string[] = [];
  for (const token of source) {
    const count = remaining.get(token) ?? 0;
    if (count > 0) remaining.set(token, count - 1);
    else missing.push(token);
  }
  return missing;
}

/**
 * Mentions, hashtags or links of the source that the edit dropped or changed.
 * Only the listed kinds are checked.
 */
export function findDroppedTokens(
  source: string,
  output: string,
  kinds: readonly ProtectedTokenKind[],
): string[] {
  const before = extractProtectedTokens(source);
  const after = extractProtectedTokens(output);
  return [
    ...(kinds.includes('mention')
      ? missingFrom(before.mentions, after.mentions)
      : []),
    ...(kinds.includes('hashtag')
      ? missingFrom(before.hashtags, after.hashtags)
      : []),
    ...(kinds.includes('link') ? missingFrom(before.links, after.links) : []),
  ];
}

export type TextActionRejection = 'empty' | 'limit' | 'tokens';

/**
 * The deterministic gate on a provider answer. `normalize` returns the text to
 * save for an accepted answer, or null to reject it; `rejection` says why the
 * last answer was rejected.
 */
export interface TextActionGate {
  normalize: (raw: string) => string | null;
  rejection: () => TextActionRejection | null;
}

/**
 * Gate for an edit of the user's own draft: the answer must fit the channel and
 * keep what the author wrote that an edit may not touch. Proofreading keeps
 * mentions, hashtags and links; rewriting keeps mentions and links.
 */
export function createTextActionGate(input: {
  maxCharacters: number;
  mode: 'proofread' | 'rewrite';
  source: string;
  usesWeightedCharacters: boolean;
}): TextActionGate {
  const kinds: ProtectedTokenKind[] =
    input.mode === 'proofread'
      ? ['mention', 'hashtag', 'link']
      : ['mention', 'link'];
  let reason: TextActionRejection | null = null;
  return {
    normalize: (text) => {
      const length = measureChannelText(text, input.usesWeightedCharacters);
      if (length === 0 || length > input.maxCharacters) {
        reason = 'limit';
        return null;
      }
      if (findDroppedTokens(input.source, text, kinds).length > 0) {
        reason = 'tokens';
        return null;
      }
      return text;
    },
    rejection: () => reason,
  };
}

/** Proofreading never shortens the room an over-long draft already uses. */
export function resolveTextActionLimit(input: {
  channelLimit: number;
  mode: 'proofread' | 'rewrite';
  source: string;
  usesWeightedCharacters: boolean;
}): number {
  if (input.mode === 'rewrite') return input.channelLimit;
  const used = measureChannelText(input.source, input.usesWeightedCharacters);
  return Math.max(input.channelLimit, Math.ceil(used * 1.05));
}

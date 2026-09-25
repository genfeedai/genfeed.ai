import type {
  IBrandVoiceKindStats,
  IBrandVoicePhraseCount,
  IBrandVoiceSample,
  IBrandVoiceStylometrics,
} from '@genfeedai/contracts/interfaces';

/**
 * Deterministic stylometrics over a brand's own writing. Pure functions only:
 * the same samples always yield the same numbers, rules, and ordering, so the
 * voice profile can be regenerated and diffed without model noise.
 */

/** Below this many samples the measured rules are too noisy to publish. */
export const MIN_SAMPLES_FOR_STYLE_RULES = 10;

const LEADING_MENTIONS_PATTERN = /^(?:\s*[.]?@[\w.]+[,:]?)+\s*/u;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const HASHTAG_PATTERN = /(?:^|\s)#[\p{L}\p{N}_]+/gu;
const MENTION_PATTERN = /(?:^|[^\p{L}\p{N}_])@[\w.]{2,}/gu;
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;
const LETTER_PATTERN = /\p{L}/u;
const SENTENCE_SPLIT_PATTERN = /(?<=[.!?…])\s+|\n+/u;
const EM_DASH_PATTERN = /—|\s--\s|\s–\s/u;
const ELLIPSIS_PATTERN = /…|\.\.\./u;
const TRAILING_NOISE_PATTERN =
  /(?:\s*(?:(?:https?:\/\/|www\.)\S+|#[\p{L}\p{N}_]+|\p{Extended_Pictographic}|️|‍))+\s*$/u;

/**
 * Openers that signal disagreement or pushback. Matched against the start of
 * the text (after any leading reply @mentions), case-insensitively.
 */
const DISAGREEMENT_OPENERS = [
  'hard disagree',
  'strongly disagree',
  'respectfully',
  'counterpoint',
  'unpopular opinion',
  'hot take',
  'not really',
  'not true',
  "i don't think",
  'i dont think',
  'i disagree',
  "that's not",
  'thats not',
  'disagree',
  'actually',
  'nope',
  'nah',
  'imho',
  'imo',
  'wrong',
  'no',
] as const;

const STOPWORDS = new Set([
  'a',
  'about',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'get',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  "it's",
  'its',
  'just',
  'me',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'so',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'to',
  'up',
  'was',
  'we',
  'were',
  'what',
  'when',
  'which',
  'who',
  'will',
  'with',
  'you',
  'your',
]);

const MAX_OPENERS = 8;
const MAX_PHRASES = 10;
const MAX_DISAGREEMENT_OPENERS = 5;

/** Drops the @mentions a platform prepends to replies. */
export function stripLeadingMentions(text: string): string {
  return text.replace(LEADING_MENTIONS_PATTERN, '').trim();
}

/**
 * Canonical form used to dedupe samples and to match model-quoted lines back
 * to the corpus: case-folded, URLs and leading mentions removed, whitespace
 * collapsed.
 */
export function normalizeVoiceText(text: string): string {
  return stripLeadingMentions(text)
    .replace(URL_PATTERN, ' ')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The text a measurement looks at: the author's words, minus reply mentions. */
function analysisText(sample: IBrandVoiceSample): string {
  return stripLeadingMentions(sample.text);
}

function words(text: string): string[] {
  return text.replace(URL_PATTERN, ' ').match(WORD_PATTERN) ?? [];
}

function lowerWords(text: string): string[] {
  return words(text).map((word) => word.toLowerCase().replace(/’/g, "'"));
}

/** Nearest-rank percentile over an ascending-sorted list. */
export function percentile(
  sorted: readonly number[],
  fraction: number,
): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

/** Median rounded to the nearest integer (mean of the middle pair when even). */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 1000;
}

function average(total: number, count: number): number {
  return count === 0 ? 0 : Math.round((total / count) * 100) / 100;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/** Whether the first letter of the text is lowercase; null when it has none. */
function startsLowercase(text: string): boolean | null {
  const first = text.replace(URL_PATTERN, ' ').match(LETTER_PATTERN)?.[0];
  if (!first) {
    return null;
  }
  const isCased = first.toLowerCase() !== first.toUpperCase();
  if (!isCased) {
    return null;
  }
  return first === first.toLowerCase();
}

function endsWithPeriod(text: string): boolean {
  const trimmed = text.replace(TRAILING_NOISE_PATTERN, '').trimEnd();
  return (
    trimmed.endsWith('.') && !trimmed.endsWith('...') && !trimmed.endsWith('..')
  );
}

function rankCounts(
  counts: Map<string, number>,
  minimum: number,
  limit: number,
): IBrandVoicePhraseCount[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort(([leftPhrase, leftCount], [rightPhrase, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }
      const lengthDelta =
        rightPhrase.split(' ').length - leftPhrase.split(' ').length;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }
      return leftPhrase.localeCompare(rightPhrase);
    })
    .slice(0, limit)
    .map(([phrase, count]) => ({ count, phrase }));
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Drops a shorter phrase when a longer ranked phrase contains it with the same
 * count — "love this" adds nothing next to "love this so" seen equally often.
 */
function dropSubsumed(counts: Map<string, number>): Map<string, number> {
  const entries = [...counts.entries()];
  return new Map(
    entries.filter(
      ([phrase, count]) =>
        !entries.some(
          ([other, otherCount]) =>
            other !== phrase &&
            otherCount === count &&
            other.split(' ').length > phrase.split(' ').length &&
            ` ${other} `.includes(` ${phrase} `),
        ),
    ),
  );
}

function computeOpeners(texts: readonly string[]): IBrandVoicePhraseCount[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = lowerWords(text);
    if (tokens.length === 0) {
      continue;
    }
    const seen = new Set<string>();
    for (const size of [2, 3]) {
      const opener = tokens.slice(0, size).join(' ');
      if (tokens.length >= size && !seen.has(opener)) {
        seen.add(opener);
        increment(counts, opener);
      }
    }
    if (tokens.length === 1) {
      increment(counts, tokens[0] ?? '');
    }
  }
  return rankCounts(dropSubsumed(counts), 2, MAX_OPENERS);
}

function computeRecurringPhrases(
  texts: readonly string[],
): IBrandVoicePhraseCount[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const tokens = lowerWords(text).filter((token) => !token.startsWith('#'));
    const seen = new Set<string>();
    for (const size of [2, 3, 4]) {
      for (let index = 0; index + size <= tokens.length; index += 1) {
        const gram = tokens.slice(index, index + size);
        const contentTokens = gram.filter((token) => !STOPWORDS.has(token));
        // At least one content word, and never a pure-stopword run.
        if (contentTokens.length === 0) {
          continue;
        }
        if (size === 2 && contentTokens.length < 2 && gram.length === 2) {
          // "the product" style pairs are noise; keep two-word phrases only
          // when both words carry meaning.
          continue;
        }
        seen.add(gram.join(' '));
      }
    }
    for (const phrase of seen) {
      increment(counts, phrase);
    }
  }
  const minimum = texts.length >= 40 ? 3 : 2;
  return rankCounts(dropSubsumed(counts), minimum, MAX_PHRASES);
}

function matchDisagreementOpener(text: string): string | null {
  const lowered = text
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/^[^\p{L}\p{N}]+/u, '');
  for (const opener of DISAGREEMENT_OPENERS) {
    if (!lowered.startsWith(opener)) {
      continue;
    }
    const next = lowered.charAt(opener.length);
    if (next === '' || !/[\p{L}\p{N}']/u.test(next)) {
      return opener;
    }
  }
  return null;
}

function kindStats(
  samples: readonly IBrandVoiceSample[],
): IBrandVoiceKindStats {
  const lengths = samples
    .map((sample) => analysisText(sample).length)
    .sort((left, right) => left - right);
  const casing = samples
    .map((sample) => startsLowercase(analysisText(sample)))
    .filter((value): value is boolean => value !== null);
  return {
    count: samples.length,
    lowercaseStartShare: ratio(casing.filter(Boolean).length, casing.length),
    medianChars: median(lengths),
    p90Chars: percentile(lengths, 0.9),
  };
}

/** Measures the writing habits of the given samples. */
export function computeVoiceStylometrics(
  samples: readonly IBrandVoiceSample[],
): IBrandVoiceStylometrics {
  const texts = samples.map(analysisText);
  const total = texts.length;
  const charLengths = texts
    .map((text) => text.length)
    .sort((left, right) => left - right);
  const wordCounts = texts
    .map((text) => words(text).length)
    .sort((left, right) => left - right);
  const sentenceWordCounts = texts.flatMap((text) =>
    text
      .split(SENTENCE_SPLIT_PATTERN)
      .map((sentence) => words(sentence).length)
      .filter((count) => count > 0),
  );

  let capsWords = 0;
  let casedWords = 0;
  let emojiCount = 0;
  let hashtagCount = 0;
  const flags = {
    emDash: 0,
    emoji: 0,
    endsWithPeriod: 0,
    ellipsis: 0,
    exclamation: 0,
    hashtag: 0,
    lineBreak: 0,
    mention: 0,
    question: 0,
    url: 0,
  };
  const casing: boolean[] = [];
  const disagreementOpeners = new Map<string, number>();
  let disagreementCount = 0;

  for (const text of texts) {
    for (const word of words(text)) {
      const letters = word.replace(/[^\p{L}]/gu, '');
      if (
        letters.length < 3 ||
        letters.toLowerCase() === letters.toUpperCase()
      ) {
        continue;
      }
      casedWords += 1;
      if (letters === letters.toUpperCase()) {
        capsWords += 1;
      }
    }
    const emojis = countMatches(text, EMOJI_PATTERN);
    const hashtags = countMatches(text, HASHTAG_PATTERN);
    emojiCount += emojis;
    hashtagCount += hashtags;
    if (emojis > 0) flags.emoji += 1;
    if (hashtags > 0) flags.hashtag += 1;
    if (countMatches(text, MENTION_PATTERN) > 0) flags.mention += 1;
    if (countMatches(text, URL_PATTERN) > 0) flags.url += 1;
    if (EM_DASH_PATTERN.test(text)) flags.emDash += 1;
    if (ELLIPSIS_PATTERN.test(text)) flags.ellipsis += 1;
    if (text.includes('!')) flags.exclamation += 1;
    if (text.includes('?')) flags.question += 1;
    if (text.includes('\n')) flags.lineBreak += 1;
    if (endsWithPeriod(text)) flags.endsWithPeriod += 1;

    const isLowercase = startsLowercase(text);
    if (isLowercase !== null) {
      casing.push(isLowercase);
    }

    const opener = matchDisagreementOpener(text);
    if (opener) {
      disagreementCount += 1;
      increment(disagreementOpeners, opener);
    }
  }

  return {
    allCapsWordShare: ratio(capsWords, casedWords),
    disagreement: {
      count: disagreementCount,
      openers: rankCounts(disagreementOpeners, 1, MAX_DISAGREEMENT_OPENERS),
      share: ratio(disagreementCount, total),
    },
    ellipsisShare: ratio(flags.ellipsis, total),
    emDashShare: ratio(flags.emDash, total),
    emojiPerSample: average(emojiCount, total),
    emojiSampleShare: ratio(flags.emoji, total),
    endsWithPeriodShare: ratio(flags.endsWithPeriod, total),
    exclamationShare: ratio(flags.exclamation, total),
    hashtagPerSample: average(hashtagCount, total),
    hashtagSampleShare: ratio(flags.hashtag, total),
    length: {
      medianChars: median(charLengths),
      medianWords: median(wordCounts),
      p25Chars: percentile(charLengths, 0.25),
      p75Chars: percentile(charLengths, 0.75),
      p90Chars: percentile(charLengths, 0.9),
      p90Words: percentile(wordCounts, 0.9),
    },
    lineBreakShare: ratio(flags.lineBreak, total),
    lowercaseStartShare: ratio(casing.filter(Boolean).length, casing.length),
    medianSentenceWords: median(sentenceWordCounts),
    mentionSampleShare: ratio(flags.mention, total),
    originals: kindStats(
      samples.filter((sample) => sample.kind === 'original'),
    ),
    questionShare: ratio(flags.question, total),
    recurringPhrases: computeRecurringPhrases(texts),
    replies: kindStats(samples.filter((sample) => sample.kind === 'reply')),
    sampleCount: total,
    topOpeners: computeOpeners(texts),
    urlSampleShare: ratio(flags.url, total),
  };
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function quoteList(phrases: readonly IBrandVoicePhraseCount[], limit: number) {
  return phrases
    .slice(0, limit)
    .map((entry) => `"${entry.phrase}"`)
    .join(' / ');
}

/**
 * Turns measured habits into concrete writing rules. Only clear signals become
 * rules; ambiguous middles are left to the model. Returns nothing for corpora
 * too small to measure reliably.
 */
export function deriveVoiceWritingRules(
  metrics: IBrandVoiceStylometrics,
): string[] {
  if (metrics.sampleCount < MIN_SAMPLES_FOR_STYLE_RULES) {
    return [];
  }

  const rules: string[] = [];
  const { length, originals, replies } = metrics;

  if (replies.count >= 3) {
    rules.push(
      `Keep replies short: typically ~${replies.medianChars} characters and rarely over ${replies.p90Chars}`,
    );
  }
  if (originals.count >= 3) {
    rules.push(
      `Original posts run ~${originals.medianChars} characters (most between ${length.p25Chars} and ${length.p75Chars})`,
    );
  } else if (replies.count < 3) {
    rules.push(
      `Posts run ~${length.medianChars} characters and rarely exceed ${length.p90Chars}`,
    );
  }

  if (metrics.lowercaseStartShare >= 0.6) {
    rules.push(
      `Start in lowercase (${percent(metrics.lowercaseStartShare)} of real posts do)`,
    );
  } else if (metrics.lowercaseStartShare <= 0.1) {
    rules.push('Start sentences with a capital letter');
  }

  if (metrics.endsWithPeriodShare <= 0.25) {
    rules.push('Usually leave off the final period');
  }

  if (metrics.emojiSampleShare <= 0.05) {
    rules.push('Do not use emojis');
  } else if (metrics.emojiSampleShare >= 0.4) {
    rules.push(
      `Emojis are part of the voice (${percent(metrics.emojiSampleShare)} of posts use one)`,
    );
  }

  if (metrics.hashtagSampleShare <= 0.05) {
    rules.push('Do not use hashtags');
  }

  if (metrics.emDashShare <= 0.02) {
    rules.push('Never use em dashes');
  } else if (metrics.emDashShare >= 0.15) {
    rules.push('Em dashes are a natural habit here');
  }

  if (metrics.exclamationShare <= 0.05) {
    rules.push('Avoid exclamation marks');
  } else if (metrics.exclamationShare >= 0.3) {
    rules.push('Exclamation marks are common');
  }

  if (metrics.ellipsisShare >= 0.15) {
    rules.push('Trailing ellipses (...) are common');
  }

  if (metrics.lineBreakShare >= 0.5) {
    rules.push('Break thoughts onto separate lines');
  } else if (metrics.lineBreakShare <= 0.1) {
    rules.push('Write as a single block with no line breaks');
  }

  if (metrics.allCapsWordShare >= 0.05) {
    rules.push('Use occasional ALL-CAPS words for emphasis');
  }

  if (metrics.disagreement.count >= 2 && metrics.disagreement.openers.length) {
    rules.push(
      `When disagreeing, open bluntly the way they do: ${quoteList(metrics.disagreement.openers, 3)}`,
    );
  }

  if (metrics.topOpeners.length >= 2) {
    rules.push(`Openers they reach for: ${quoteList(metrics.topOpeners, 4)}`);
  }

  return rules;
}

/** Renders the measurements as prompt evidence lines. */
export function formatStylometricsForPrompt(
  metrics: IBrandVoiceStylometrics,
): string {
  const { length, originals, replies } = metrics;
  const lines = [
    `- Samples measured: ${metrics.sampleCount} (${replies.count} replies, ${originals.count} original posts)`,
    `- Length: median ${length.medianChars} chars / ${length.medianWords} words; 25th-75th percentile ${length.p25Chars}-${length.p75Chars} chars; 90th percentile ${length.p90Chars} chars`,
    replies.count > 0 &&
      `- Replies: median ${replies.medianChars} chars, 90th percentile ${replies.p90Chars}; ${percent(replies.lowercaseStartShare)} start lowercase`,
    originals.count > 0 &&
      `- Original posts: median ${originals.medianChars} chars, 90th percentile ${originals.p90Chars}; ${percent(originals.lowercaseStartShare)} start lowercase`,
    `- Median sentence length: ${metrics.medianSentenceWords} words`,
    `- Starts lowercase: ${percent(metrics.lowercaseStartShare)}; ends with a period: ${percent(metrics.endsWithPeriodShare)}; ALL-CAPS words: ${percent(metrics.allCapsWordShare)}`,
    `- Emoji: ${percent(metrics.emojiSampleShare)} of posts (${metrics.emojiPerSample} per post)`,
    `- Punctuation (share of posts): em dash ${percent(metrics.emDashShare)}, ellipsis ${percent(metrics.ellipsisShare)}, exclamation ${percent(metrics.exclamationShare)}, question ${percent(metrics.questionShare)}`,
    `- Line breaks: ${percent(metrics.lineBreakShare)} of posts`,
    `- Hashtags: ${percent(metrics.hashtagSampleShare)} of posts (${metrics.hashtagPerSample} per post); in-text @mentions: ${percent(metrics.mentionSampleShare)}; links: ${percent(metrics.urlSampleShare)}`,
    metrics.topOpeners.length > 0 &&
      `- Frequent openers: ${metrics.topOpeners.map((entry) => `"${entry.phrase}" (${entry.count})`).join(', ')}`,
    metrics.recurringPhrases.length > 0 &&
      `- Recurring phrases: ${metrics.recurringPhrases.map((entry) => `"${entry.phrase}" (${entry.count})`).join(', ')}`,
    metrics.disagreement.count > 0 &&
      `- Disagreement openers (${metrics.disagreement.count} posts): ${metrics.disagreement.openers.map((entry) => `"${entry.phrase}" (${entry.count})`).join(', ')}`,
  ];
  return lines
    .filter((line): line is string => typeof line === 'string')
    .join('\n');
}

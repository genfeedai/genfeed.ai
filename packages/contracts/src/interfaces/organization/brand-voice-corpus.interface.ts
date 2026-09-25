/**
 * Where a voice sample came from. Every origin is the brand's OWN writing:
 * posts imported from its connected accounts, posts Genfeed published for it,
 * or posts the user pasted as their own. Followed/imported inspiration
 * sources never enter the voice corpus.
 */
export type BrandVoiceSampleOrigin =
  | 'own-account'
  | 'published-post'
  | 'pasted';

export type BrandVoiceSampleKind = 'original' | 'reply';

export interface IBrandVoiceSample {
  /** Stable id of the backing row (`pasted-<n>` for pasted samples). */
  id: string;
  kind: BrandVoiceSampleKind;
  origin: BrandVoiceSampleOrigin;
  platform: string | null;
  /** ISO timestamp, or null when unknown (pasted samples). */
  publishedAt: string | null;
  /** Verbatim text as written by the brand. */
  text: string;
}

export interface IBrandVoiceLengthStats {
  medianChars: number;
  p25Chars: number;
  p75Chars: number;
  p90Chars: number;
  medianWords: number;
  p90Words: number;
}

export interface IBrandVoicePhraseCount {
  count: number;
  phrase: string;
}

export interface IBrandVoiceKindStats {
  count: number;
  /** Share (0-1) of samples of this kind whose first letter is lowercase. */
  lowercaseStartShare: number;
  medianChars: number;
  p90Chars: number;
}

/**
 * Deterministic writing statistics measured over the voice corpus. Shares are
 * 0-1 fractions of samples; rates are averages per sample. Leading reply
 * @mentions are excluded from every measurement.
 */
export interface IBrandVoiceStylometrics {
  sampleCount: number;
  length: IBrandVoiceLengthStats;
  medianSentenceWords: number;
  lowercaseStartShare: number;
  allCapsWordShare: number;
  emojiSampleShare: number;
  emojiPerSample: number;
  emDashShare: number;
  ellipsisShare: number;
  exclamationShare: number;
  questionShare: number;
  endsWithPeriodShare: number;
  lineBreakShare: number;
  hashtagSampleShare: number;
  hashtagPerSample: number;
  mentionSampleShare: number;
  urlSampleShare: number;
  topOpeners: IBrandVoicePhraseCount[];
  recurringPhrases: IBrandVoicePhraseCount[];
  disagreement: {
    count: number;
    openers: IBrandVoicePhraseCount[];
    share: number;
  };
  replies: IBrandVoiceKindStats;
  originals: IBrandVoiceKindStats;
}

/** Response-facing description of the evidence a voice draft was built on. */
export interface IBrandVoiceCorpusSummary {
  sampleCount: number;
  replyCount: number;
  originalCount: number;
  originCounts: Record<BrandVoiceSampleOrigin, number>;
  platforms: string[];
  /** ISO dates (YYYY-MM-DD) of the oldest and newest dated sample. */
  dateRange: { from: string; to: string } | null;
  /** Minimum number of samples for a reliable voice read. */
  minimumSampleCount: number;
  /** False when the corpus has fewer than `minimumSampleCount` samples. */
  isSufficient: boolean;
  /** e.g. "own posts: 120 samples from twitter, linkedin, 2026-06-01 to 2026-09-20". */
  label: string;
  /** How to grow the corpus; present only when `isSufficient` is false. */
  guidance?: string;
}

/** A corpus candidate before selection; `engagement` is null when unknown. */
export interface IBrandVoiceCorpusCandidate extends IBrandVoiceSample {
  engagement: number | null;
}

/** The selected own-writing corpus with its measurements and summary. */
export interface IBrandVoiceCorpus {
  samples: IBrandVoiceSample[];
  stylometrics: IBrandVoiceStylometrics;
  summary: IBrandVoiceCorpusSummary;
}

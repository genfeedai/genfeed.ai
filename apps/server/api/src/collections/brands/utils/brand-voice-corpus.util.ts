import {
  computeVoiceStylometrics,
  formatStylometricsForPrompt,
  normalizeVoiceText,
} from '@api/collections/brands/utils/brand-voice-stylometrics.util';
import type {
  BrandVoiceSampleOrigin,
  IBrandVoiceCorpus,
  IBrandVoiceCorpusCandidate,
  IBrandVoiceCorpusSummary,
  IBrandVoiceSample,
} from '@genfeedai/contracts/interfaces';

/** Upper bound on samples a voice read is built from. */
export const VOICE_CORPUS_SAMPLE_CAP = 150;
/** Below this many samples the draft warns that it cannot sound like the user yet. */
export const VOICE_CORPUS_MINIMUM_SAMPLES = 10;
/** Pasted samples accepted per request. */
export const VOICE_CORPUS_MAX_PASTED = 50;
/** Longest pasted sample kept, in characters. */
export const VOICE_CORPUS_MAX_PASTED_LENGTH = 3000;
/** Real posts quoted into the drafting prompt. */
export const VOICE_PROMPT_SAMPLE_LIMIT = 40;
/** Longest single sample quoted into the prompt. */
const VOICE_PROMPT_SAMPLE_CHARS = 600;

const ORIGIN_PRIORITY: Record<BrandVoiceSampleOrigin, number> = {
  pasted: 0,
  'own-account': 1,
  'published-post': 2,
};

/**
 * Published Genfeed posts were drafted by the product and only approved by the
 * user, so they are weaker evidence of how the user writes than posts the
 * account published itself.
 */
const PUBLISHED_POST_WEIGHT = 0.85;
const RECENCY_WEIGHT = 0.6;
const ENGAGEMENT_WEIGHT = 0.4;
const NEUTRAL_ENGAGEMENT = 0.5;

const HAS_WORD_PATTERN = /[\p{L}\p{N}]/u;

export const EMPTY_CORPUS_GUIDANCE =
  'No posts written by this brand were found, so this draft is based on the website and brand details only and will not sound like you yet. To fix it, turn on "Import existing posts" for this brand in Settings → Integrations and connect your account, or paste 10-20 of your own posts (replies included) and draft again.';

function buildThinCorpusGuidance(count: number): string {
  return `Only ${count} ${count === 1 ? 'post' : 'posts'} written by this brand ${count === 1 ? 'was' : 'were'} found, which is too few to learn how you write. To fix it, turn on "Import existing posts" for this brand in Settings → Integrations and connect your account, or paste 10-20 of your own posts (replies included) and draft again.`;
}

function compareIds(left: IBrandVoiceSample, right: IBrandVoiceSample) {
  return left.id.localeCompare(right.id);
}

function timestamp(sample: IBrandVoiceSample): number {
  if (!sample.publishedAt) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(sample.publishedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function newestFirst(left: IBrandVoiceSample, right: IBrandVoiceSample) {
  const delta = timestamp(right) - timestamp(left);
  if (delta !== 0 && !Number.isNaN(delta)) {
    return delta > 0 ? 1 : -1;
  }
  return compareIds(left, right);
}

/**
 * Turns user-pasted text into corpus candidates. Blank entries are dropped and
 * entries are clipped, but the kept text is otherwise verbatim.
 */
export function toPastedCandidates(
  pasted: readonly string[] | undefined,
): IBrandVoiceCorpusCandidate[] {
  return (pasted ?? [])
    .filter((text): text is string => typeof text === 'string')
    .map((text) => text.trim())
    .filter((text) => HAS_WORD_PATTERN.test(text))
    .slice(0, VOICE_CORPUS_MAX_PASTED)
    .map((text, index) => ({
      engagement: null,
      id: `pasted-${index + 1}`,
      kind: text.startsWith('@') ? 'reply' : 'original',
      origin: 'pasted',
      platform: null,
      publishedAt: null,
      text: text.slice(0, VOICE_CORPUS_MAX_PASTED_LENGTH),
    }));
}

/**
 * Rank-based 0-1 scores so the result is independent of absolute scales. Tied
 * values share their average rank, so equal inputs always score equally.
 */
function rankScores(
  candidates: readonly IBrandVoiceCorpusCandidate[],
  value: (candidate: IBrandVoiceCorpusCandidate) => number,
): Map<string, number> {
  const ordered = [...candidates].sort((left, right) => {
    const delta = value(left) - value(right);
    return delta !== 0 ? delta : compareIds(left, right);
  });
  const values = ordered.map(value);
  const denominator = Math.max(1, ordered.length - 1);
  const scores = new Map<string, number>();
  let start = 0;
  while (start < ordered.length) {
    let end = start;
    while (end + 1 < values.length && values[end + 1] === values[start]) {
      end += 1;
    }
    const score = ordered.length === 1 ? 1 : (start + end) / 2 / denominator;
    for (let index = start; index <= end; index += 1) {
      const candidate = ordered[index];
      if (candidate) {
        scores.set(candidate.id, score);
      }
    }
    start = end + 1;
  }
  return scores;
}

function scoreCandidates(
  candidates: readonly IBrandVoiceCorpusCandidate[],
): Map<string, number> {
  const recency = rankScores(candidates, (candidate) => {
    const time = timestamp(candidate);
    return Number.isFinite(time) ? time : 0;
  });
  const measured = candidates.filter(
    (candidate) => candidate.engagement !== null,
  );
  const engagement = rankScores(
    measured,
    (candidate) => candidate.engagement ?? 0,
  );

  return new Map(
    candidates.map((candidate) => {
      const base =
        RECENCY_WEIGHT * (recency.get(candidate.id) ?? 0) +
        ENGAGEMENT_WEIGHT *
          (engagement.get(candidate.id) ?? NEUTRAL_ENGAGEMENT);
      const weight =
        candidate.origin === 'published-post' ? PUBLISHED_POST_WEIGHT : 1;
      return [candidate.id, base * weight];
    }),
  );
}

function byScore(scores: Map<string, number>) {
  return (left: IBrandVoiceSample, right: IBrandVoiceSample) => {
    const delta = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
    return delta !== 0 ? delta : newestFirst(left, right);
  };
}

/**
 * Picks the voice corpus from own-writing candidates: drops empty and duplicate
 * text (keeping the most authentic origin), always keeps pasted samples, then
 * fills the cap with the best-scoring replies and original posts in balance,
 * preferring recent and better-performing posts. Deterministic for a given
 * input.
 */
export function selectVoiceCorpus(
  candidates: readonly IBrandVoiceCorpusCandidate[],
  cap: number = VOICE_CORPUS_SAMPLE_CAP,
): IBrandVoiceSample[] {
  const byKey = new Map<string, IBrandVoiceCorpusCandidate>();
  const ordered = [...candidates].sort((left, right) => {
    const priority =
      ORIGIN_PRIORITY[left.origin] - ORIGIN_PRIORITY[right.origin];
    return priority !== 0 ? priority : newestFirst(left, right);
  });
  for (const candidate of ordered) {
    const key = normalizeVoiceText(candidate.text);
    if (!HAS_WORD_PATTERN.test(key) || byKey.has(key)) {
      continue;
    }
    byKey.set(key, candidate);
  }

  const unique = [...byKey.values()];
  const pasted = unique
    .filter((candidate) => candidate.origin === 'pasted')
    .slice(0, cap);
  const rest = unique.filter((candidate) => candidate.origin !== 'pasted');
  const scores = scoreCandidates(rest);
  const replies = rest
    .filter((candidate) => candidate.kind === 'reply')
    .sort(byScore(scores));
  const originals = rest
    .filter((candidate) => candidate.kind === 'original')
    .sort(byScore(scores));

  const remaining = Math.max(0, cap - pasted.length);
  const replyQuota = Math.min(replies.length, Math.ceil(remaining / 2));
  const originalQuota = Math.min(originals.length, remaining - replyQuota);
  const extraReplies = Math.min(
    replies.length - replyQuota,
    remaining - replyQuota - originalQuota,
  );
  const chosen = [
    ...replies.slice(0, replyQuota + extraReplies),
    ...originals.slice(0, originalQuota),
  ].sort(newestFirst);

  return [...pasted, ...chosen].map(
    ({ engagement: _engagement, ...sample }) => sample,
  );
}

function isoDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Describes the corpus for the user: counts, platforms, dates, guidance. */
export function summarizeVoiceCorpus(
  samples: readonly IBrandVoiceSample[],
): IBrandVoiceCorpusSummary {
  const originCounts: Record<BrandVoiceSampleOrigin, number> = {
    'own-account': 0,
    pasted: 0,
    'published-post': 0,
  };
  for (const sample of samples) {
    originCounts[sample.origin] += 1;
  }
  const platforms = [
    ...new Set(
      samples
        .map((sample) => sample.platform?.trim().toLowerCase())
        .filter((platform): platform is string => Boolean(platform)),
    ),
  ].sort();
  const times = samples
    .map(timestamp)
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);
  const dateRange =
    times.length > 0
      ? {
          from: isoDate(times[0] ?? 0),
          to: isoDate(times[times.length - 1] ?? 0),
        }
      : null;
  const replyCount = samples.filter((sample) => sample.kind === 'reply').length;
  const sampleCount = samples.length;
  const isSufficient = sampleCount >= VOICE_CORPUS_MINIMUM_SAMPLES;

  const label =
    sampleCount === 0
      ? 'no own posts found'
      : [
          `own posts: ${sampleCount} ${sampleCount === 1 ? 'sample' : 'samples'}`,
          ` (${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}, ${sampleCount - replyCount} original`,
          originCounts.pasted > 0 ? `, ${originCounts.pasted} pasted` : '',
          ')',
          platforms.length > 0 ? ` from ${platforms.join(', ')}` : '',
          dateRange ? `, ${dateRange.from} to ${dateRange.to}` : '',
        ].join('');

  return {
    dateRange,
    ...(isSufficient
      ? {}
      : {
          guidance:
            sampleCount === 0
              ? EMPTY_CORPUS_GUIDANCE
              : buildThinCorpusGuidance(sampleCount),
        }),
    isSufficient,
    label,
    minimumSampleCount: VOICE_CORPUS_MINIMUM_SAMPLES,
    originCounts,
    originalCount: sampleCount - replyCount,
    platforms,
    replyCount,
    sampleCount,
  };
}

/** Selects, measures, and summarizes a corpus from raw candidates. */
export function buildVoiceCorpus(
  candidates: readonly IBrandVoiceCorpusCandidate[],
  cap: number = VOICE_CORPUS_SAMPLE_CAP,
): IBrandVoiceCorpus {
  const samples = selectVoiceCorpus(candidates, cap);
  return {
    samples,
    stylometrics: computeVoiceStylometrics(samples),
    summary: summarizeVoiceCorpus(samples),
  };
}

function interleaveKinds(
  replies: readonly IBrandVoiceSample[],
  originals: readonly IBrandVoiceSample[],
): IBrandVoiceSample[] {
  const interleaved: IBrandVoiceSample[] = [];
  const longest = Math.max(replies.length, originals.length);
  for (let index = 0; index < longest; index += 1) {
    const reply = replies[index];
    const original = originals[index];
    if (reply) interleaved.push(reply);
    if (original) interleaved.push(original);
  }
  return interleaved;
}

/**
 * The real posts quoted to the model, in a stable order: pasted first, then
 * alternating replies and originals so both registers are represented.
 */
export function pickPromptSamples(
  samples: readonly IBrandVoiceSample[],
  limit: number = VOICE_PROMPT_SAMPLE_LIMIT,
): IBrandVoiceSample[] {
  const rest = samples.filter((sample) => sample.origin !== 'pasted');
  return [
    ...samples.filter((sample) => sample.origin === 'pasted'),
    ...interleaveKinds(
      rest.filter((sample) => sample.kind === 'reply'),
      rest.filter((sample) => sample.kind === 'original'),
    ),
  ].slice(0, limit);
}

/** Numbered, verbatim sample block for the drafting prompt. */
export function formatPromptSamples(
  samples: readonly IBrandVoiceSample[],
): string {
  return samples
    .map((sample, index) => {
      const meta = [
        sample.kind,
        sample.platform,
        sample.origin === 'pasted' ? 'pasted by user' : null,
      ]
        .filter(Boolean)
        .join(', ');
      const text =
        sample.text.length > VOICE_PROMPT_SAMPLE_CHARS
          ? `${sample.text.slice(0, VOICE_PROMPT_SAMPLE_CHARS)} [truncated]`
          : sample.text;
      return `[${index + 1}] (${meta})\n${text}`;
    })
    .join('\n\n');
}

/**
 * Resolves the model's exemplar picks to verbatim corpus text. Picks are
 * accepted as 1-based sample numbers or as quoted text; quoted text counts
 * only when it matches a sample exactly after normalization, and the stored
 * sample text is returned rather than the model's copy. Anything the model
 * invented is discarded.
 */
export function resolveVerbatimExemplars(
  picks: { ids: readonly number[]; texts: readonly string[] },
  promptSamples: readonly IBrandVoiceSample[],
  limit: number,
): string[] {
  const byKey = new Map(
    promptSamples.map((sample) => [normalizeVoiceText(sample.text), sample]),
  );
  const resolved: IBrandVoiceSample[] = [];
  const seen = new Set<string>();
  const add = (sample: IBrandVoiceSample | undefined) => {
    if (!sample || seen.has(sample.id) || resolved.length >= limit) {
      return;
    }
    seen.add(sample.id);
    resolved.push(sample);
  };

  for (const id of picks.ids) {
    if (Number.isInteger(id)) {
      add(promptSamples[id - 1]);
    }
  }
  for (const text of picks.texts) {
    add(byKey.get(normalizeVoiceText(text)));
  }
  return resolved.map((sample) => sample.text);
}

/**
 * Deterministic exemplar fallback when the model picks none: the samples
 * closest to their kind's median length, alternating replies and originals.
 */
export function pickRepresentativeExemplars(
  samples: readonly IBrandVoiceSample[],
  limit: number,
): string[] {
  const closestToMedian = (kindSamples: IBrandVoiceSample[]) => {
    const lengths = kindSamples
      .map((sample) => sample.text.length)
      .sort((left, right) => left - right);
    const middle = lengths[Math.floor(lengths.length / 2)] ?? 0;
    return [...kindSamples].sort((left, right) => {
      const delta =
        Math.abs(left.text.length - middle) -
        Math.abs(right.text.length - middle);
      return delta !== 0 ? delta : newestFirst(left, right);
    });
  };
  return interleaveKinds(
    closestToMedian(samples.filter((sample) => sample.kind === 'reply')),
    closestToMedian(samples.filter((sample) => sample.kind === 'original')),
  )
    .slice(0, limit)
    .map((sample) => sample.text);
}

/**
 * The evidence block for the profile prompt: what the corpus is, how it
 * measures, and the numbered verbatim posts the model must describe and pick
 * exemplars from. Null when there is no own writing to show.
 */
export function buildVoiceEvidencePrompt(
  corpus: IBrandVoiceCorpus,
  promptSamples: readonly IBrandVoiceSample[],
): string | null {
  if (promptSamples.length === 0) {
    return null;
  }
  const thinNote = corpus.summary.isSufficient
    ? ''
    : `\nOnly ${corpus.summary.sampleCount} real posts are available, so treat them as partial evidence.`;

  return `Voice evidence: the brand's OWN writing (${corpus.summary.label}).
These are real posts and replies the brand wrote. The website and stored brand details describe what the brand does; the real posts decide how it writes. Where they disagree on tone or style, follow the real posts.${thinNote}

Measured style statistics (computed over all ${corpus.summary.sampleCount} samples):
${formatStylometricsForPrompt(corpus.stylometrics)}

Real posts (verbatim, numbered):
${formatPromptSamples(promptSamples)}

Voice instructions:
- Describe tone and style from the real posts: their typical length, casing, punctuation, emoji and hashtag habits, and how they reply and disagree. Do not smooth the voice into polished marketing copy.
- sampleOutput must read like one more post from the list above: same length, casing, and punctuation habits.
- exemplarIds must be numbers from the list above. Never rewrite, merge, or invent a post.
- doNotSoundLike should name habits the statistics show are absent (for example hashtags, emojis, exclamation marks, or corporate phrasing) when they are near zero.`;
}

import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../types';

/**
 * X (Twitter) ranking-inspired constants.
 *
 * Primary sources:
 * - Legacy Heavy Ranker weights (2023 open source):
 *   https://github.com/twitter/the-algorithm-ml/blob/main/projects/home/recap/README.md
 * - Current For You architecture (Phoenix multi-action prediction, 2026):
 *   https://github.com/xai-org/x-algorithm
 *
 * Production weights change; we encode durable craft implications, not a
 * reimplementation of Phoenix. Use public engagement counts as a proxy when
 * ranking brand winners — never claim we run X's model.
 */

/** Published Heavy Ranker weights (April 2023) for documentation + scoring. */
export const X_HEAVY_RANKER_WEIGHTS_2023 = {
  fav: 0.5,
  goodClick: 11.0,
  goodClickV2: 10.0,
  goodProfileClick: 12.0,
  negativeFeedback: -74.0,
  reply: 13.5,
  replyEngagedByAuthor: 75.0,
  report: -369.0,
  retweet: 1.0,
  videoPlayback50: 0.005,
} as const;

/**
 * Map available ContentPerformance-style public metrics onto approx. action
 * weights. We do not observe author-reply loops or 2-minute dwell in API
 * metrics; comments ≈ replies, shares ≈ reposts, saves ≈ bookmarks/high intent.
 */
export const X_PUBLIC_METRIC_WEIGHTS = {
  comments: X_HEAVY_RANKER_WEIGHTS_2023.reply,
  likes: X_HEAVY_RANKER_WEIGHTS_2023.fav,
  saves: X_HEAVY_RANKER_WEIGHTS_2023.goodClickV2,
  shares: X_HEAVY_RANKER_WEIGHTS_2023.retweet,
} as const;

export type XPublicMetrics = {
  comments?: number | null;
  likes?: number | null;
  saves?: number | null;
  shares?: number | null;
  views?: number | null;
};

export function isXPlatform(platform: string | null | undefined): boolean {
  if (!platform?.trim()) {
    return false;
  }
  const normalized = platform.trim().toLowerCase();
  return (
    normalized === 'x' ||
    normalized === 'twitter' ||
    normalized === 'x.com' ||
    normalized === 'twitter.com' ||
    normalized.startsWith('twitter/') ||
    normalized.startsWith('x/')
  );
}

/**
 * Algo-inspired score from public metrics. Higher = more "X-distribution shaped"
 * (conversation and save intent over pure likes).
 */
export function scoreXPublicMetrics(metrics: XPublicMetrics): number {
  const likes = nonNegative(metrics.likes);
  const comments = nonNegative(metrics.comments);
  const shares = nonNegative(metrics.shares);
  const saves = nonNegative(metrics.saves);

  return (
    likes * X_PUBLIC_METRIC_WEIGHTS.likes +
    comments * X_PUBLIC_METRIC_WEIGHTS.comments +
    shares * X_PUBLIC_METRIC_WEIGHTS.shares +
    saves * X_PUBLIC_METRIC_WEIGHTS.saves
  );
}

/**
 * Score per 1k impressions when views are present; otherwise raw score.
 * Useful for ranking winners across different audience sizes.
 */
export function scoreXPublicMetricsPer1k(metrics: XPublicMetrics): number {
  const raw = scoreXPublicMetrics(metrics);
  const views = nonNegative(metrics.views);
  if (views <= 0) {
    return raw;
  }
  return (raw / views) * 1000;
}

function nonNegative(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function buildXPlatformContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isXPlatform(input.intent.platform)) {
    return {
      evaluationCriteria: [],
      guardrails: [],
      providerHints: [],
      sources: [],
      styleDirectives: [],
      systemDirectives: [],
    };
  }

  const isThread = input.intent.contentType === 'thread';
  const isVideo =
    input.intent.contentType === 'video' || input.intent.contentType === 'ugc';

  const systemDirectives = [
    'Optimize for X distribution: conversation and re-share worth more than passive likes.',
    'Write so a stranger would reply, quote, or save — not only double-tap.',
  ];

  const styleDirectives = [
    'Lead with a concrete claim, tension, or observation in the first line.',
    'Prefer stacked short lines over dense paragraphs.',
    'Make the post self-contained without requiring an external link in the primary text.',
    'Leave a hook for replies: a sharp take, unfinished implication, or specific question — not hollow "what do you think?" bait.',
  ];

  if (isThread) {
    styleDirectives.push(
      'Structure the thread so each post earns the next click: claim → proof → payoff → close.',
    );
    styleDirectives.push(
      'Aim for substance worth staying in the conversation (depth over dump).',
    );
  }

  if (isVideo) {
    styleDirectives.push(
      'Assume video watch-through matters: open with a strong first beat; do not bury the point.',
    );
  }

  const guardrails = [
    'Do not farm empty engagement with vague outrage, engagement-bait questions, or listicle spam.',
    'Do not open with a bare external URL as the primary post body (prefer native text; link in reply or later if needed).',
    'Avoid rage-bait, report-bait, or "show less often" triggers — negative feedback is heavily penalized on X.',
  ];

  const evaluationCriteria = [
    'X conversation potential: would a real human reply or quote with substance?',
    'X shareability: is there a quotable claim worth reposting?',
    'X dwell/depth: does the post (or thread) reward a longer look, not just a skim?',
    'X profile curiosity: would someone open the author profile after reading?',
    'X negative-risk: low chance of mute/block/report from the intended audience.',
  ];

  const providerHints = [
    'X Heavy Ranker (public 2023 weights, relative): author-engaged reply >> reply >> profile/conversation click >> retweet >> like; reports/blocks are large negatives.',
    'Phoenix (2026 For You) still multi-action predicts like/reply/repost/quote/click/dwell/follow vs block/mute/report — craft for positive conversation and dwell.',
  ];

  return {
    evaluationCriteria,
    guardrails,
    providerHints,
    sources: [],
    styleDirectives,
    systemDirectives,
  };
}

/**
 * Platform pack: contributes only when intent.platform is X/Twitter.
 * Registered alongside core-baseline so brand packs stay platform-agnostic.
 */
export const X_PLATFORM_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['platform-x', 'evaluation-baseline', 'distribution-signals'],
  contribute: buildXPlatformContribution,
  description:
    'X/Twitter platform pack: craft rules derived from open-source For You ranking signals (conversation, dwell, share > likes).',
  id: 'platform-x',
  version: '1.0.0',
};

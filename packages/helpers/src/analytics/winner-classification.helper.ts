import { WINNER_SIGNALS } from '@genfeedai/contracts/constants';
import type {
  OutlierBaselinePostInput,
  WinnerClassificationInput,
  WinnerClassificationPostResult,
  WinnerClassificationResult,
  WinnerSignal,
  WinnerSignalBaseline,
  WinnerSignalEvidence,
} from '@genfeedai/contracts/interfaces';
import { computeMetricBaseline } from './outlier-baseline.helper';

/** Counts are whole numbers; engagement rate is any finite non-negative share. */
const SIGNAL_VALIDATORS: Readonly<
  Record<WinnerSignal, (value: number) => boolean>
> = {
  comments: (value) => Number.isSafeInteger(value) && value >= 0,
  engagementRate: (value) => Number.isFinite(value) && value >= 0,
  likes: (value) => Number.isSafeInteger(value) && value >= 0,
  views: (value) => Number.isSafeInteger(value) && value >= 0,
};

/**
 * #5502 one winner contract. A post wins when ANY supported signal beats the
 * account × platform × content-type baseline for that signal, with the same
 * maturity, window, minimum sample and thresholds as outliers. A signal that
 * is missing, immature or lacks a usable baseline never qualifies a post, so
 * insufficient data never produces a winner label.
 *
 * Pure: no I/O or clock reads. Runs one baseline per signal over the same
 * posts (O(S·M·N) with S signals, M posts and an N ≤ 50 window).
 */
export function classifyWinners(
  input: WinnerClassificationInput,
): WinnerClassificationResult {
  const evidenceByPost = new Map<string, WinnerSignalEvidence[]>();
  const baselines: WinnerSignalBaseline[] = [];
  let resolved: Pick<
    WinnerClassificationResult,
    'computedAt' | 'options' | 'scope'
  > | null = null;

  for (const signal of WINNER_SIGNALS) {
    const baseline = computeMetricBaseline(
      {
        nowMs: input.nowMs,
        options: input.options,
        posts: input.posts.map(
          ({ metrics, ...post }): OutlierBaselinePostInput => ({
            ...post,
            views: metrics[signal] ?? null,
          }),
        ),
        scope: input.scope,
      },
      SIGNAL_VALIDATORS[signal],
    );
    resolved ??= {
      computedAt: baseline.computedAt,
      options: baseline.options,
      scope: baseline.scope,
    };
    baselines.push({
      median: baseline.median,
      sampleSize: baseline.sampleSize,
      signal,
      status: baseline.status,
    });
    if (baseline.median === null || baseline.median === 0) continue;

    for (const [index, result] of baseline.posts.entries()) {
      const value = input.posts[index]?.metrics[signal];
      if (result.tier === null || result.ratio === null || value == null) {
        continue;
      }
      const evidence = evidenceByPost.get(result.id) ?? [];
      evidence.push({
        baseline: baseline.median,
        ratio: result.ratio,
        sampleSize: baseline.sampleSize,
        signal,
        tier: result.tier,
        value,
      });
      evidenceByPost.set(result.id, evidence);
    }
  }

  const posts = input.posts.map((post): WinnerClassificationPostResult => {
    const evidence = (evidenceByPost.get(post.id) ?? []).sort(
      (left, right) => right.ratio - left.ratio,
    );
    return { evidence, id: post.id, isWinner: evidence.length > 0 };
  });

  if (!resolved) {
    throw new RangeError('Winner classification needs at least one signal');
  }
  return { ...resolved, baselines, posts };
}

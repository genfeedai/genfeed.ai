import type {
  OutlierBaselineExclusionReason,
  OutlierBaselineInput,
  OutlierBaselineOptions,
  OutlierBaselinePostInput,
  OutlierBaselinePostResult,
  OutlierBaselineResult,
  OutlierBaselineScope,
} from '@genfeedai/contracts/interfaces';

const SCOPE_FIELDS = [
  'organizationId',
  'accountId',
  'platform',
  'contentType',
] as const;

function isValidTime(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

function resolveOptions(
  options: OutlierBaselineInput['options'],
): OutlierBaselineOptions {
  const resolved = {
    breakoutThreshold: options?.breakoutThreshold ?? 10,
    maturityMs: options?.maturityMs ?? 48 * 60 * 60 * 1000,
    minimumSampleSize: options?.minimumSampleSize ?? 5,
    outlierThreshold: options?.outlierThreshold ?? 3,
    windowSize: options?.windowSize ?? 20,
  };
  const {
    windowSize,
    minimumSampleSize,
    maturityMs,
    outlierThreshold,
    breakoutThreshold,
  } = resolved;

  if (!Number.isInteger(windowSize) || windowSize < 5 || windowSize > 50) {
    throw new RangeError('Outlier windowSize must be an integer from 5 to 50');
  }
  if (
    !Number.isInteger(minimumSampleSize) ||
    minimumSampleSize < 5 ||
    minimumSampleSize > windowSize
  ) {
    throw new RangeError(
      'Outlier minimumSampleSize must be an integer from 5 to windowSize',
    );
  }
  if (!Number.isSafeInteger(maturityMs) || maturityMs < 0) {
    throw new RangeError(
      'Outlier maturityMs must be a nonnegative safe integer',
    );
  }
  if (
    !Number.isFinite(outlierThreshold) ||
    outlierThreshold <= 0 ||
    !Number.isFinite(breakoutThreshold) ||
    breakoutThreshold <= outlierThreshold
  ) {
    throw new RangeError(
      'Outlier thresholds must be finite, positive and strictly increasing',
    );
  }
  return resolved;
}

function validateScope(scope: Readonly<OutlierBaselineScope>): void {
  if (
    SCOPE_FIELDS.some(
      (field) =>
        typeof scope[field] !== 'string' || scope[field].trim().length === 0,
    )
  ) {
    throw new RangeError(
      'Outlier organization, account, platform and content type are required',
    );
  }
}

function exclusionReasons(
  post: Readonly<OutlierBaselinePostInput>,
  nowMs: number,
  maturityMs: number,
): OutlierBaselineExclusionReason[] {
  const reasons: OutlierBaselineExclusionReason[] = [];
  if (post.isDeleted) reasons.push('soft_deleted');
  if (post.isPinned) reasons.push('pinned');
  if (post.isPromoted) reasons.push('promoted');
  if (!isValidTime(post.publishedAtMs)) {
    reasons.push('invalid_publish_date');
  } else if (nowMs - post.publishedAtMs < maturityMs) {
    reasons.push('immature');
  }
  if (
    post.views === null ||
    !Number.isSafeInteger(post.views) ||
    post.views < 0
  ) {
    reasons.push('invalid_views');
  }
  return reasons;
}

function comparePosts(
  left: Readonly<OutlierBaselinePostInput>,
  right: Readonly<OutlierBaselinePostInput>,
): number {
  return (
    right.publishedAtMs - left.publishedAtMs ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function calculateMedian(
  selected: readonly Readonly<OutlierBaselinePostInput>[],
  minimumSampleSize: number,
): number | null {
  if (selected.length < minimumSampleSize) return null;
  // Selection includes only posts whose views passed validation.
  const views = selected
    .map((post) => post.views as number)
    .sort((a, b) => a - b);
  const middle = Math.floor(views.length / 2);
  return views.length % 2 === 1
    ? views[middle]
    : views[middle - 1] + (views[middle] - views[middle - 1]) / 2;
}

/**
 * Calculates one account's baseline without I/O or clock reads. Callers must
 * authorize and normalize their data first; this rejects mixed scopes but does
 * not replace tenant-scoped queries. Null provider flags mean unknown.
 *
 * Selects at most N=50 candidates while scanning M input posts: O(M*N) plus
 * O(N log N) for the median, O(M+N) memory including per-post provenance.
 * Snapshot persistence and collection workflow integration belong to #4403.
 */
export function computeOutlierBaseline(
  input: OutlierBaselineInput,
): OutlierBaselineResult {
  const { scope, nowMs, posts } = input;
  validateScope(scope);
  if (!isValidTime(nowMs)) {
    throw new RangeError('Outlier nowMs must be a valid integer Date epoch');
  }
  const options = resolveOptions(input.options);
  const seenIds = new Set<string>();
  const selected: Readonly<OutlierBaselinePostInput>[] = [];
  const results: OutlierBaselinePostResult[] = [];

  for (const post of posts) {
    if (
      typeof post.id !== 'string' ||
      !post.id.trim() ||
      seenIds.has(post.id)
    ) {
      throw new RangeError('Outlier post IDs must be nonempty and unique');
    }
    if (SCOPE_FIELDS.some((field) => post[field] !== scope[field])) {
      throw new RangeError(
        'Outlier posts must match the requested account scope',
      );
    }
    seenIds.add(post.id);
    const reasons = exclusionReasons(post, nowMs, options.maturityMs);
    results.push({
      id: post.id,
      isContributor: false,
      isPinnedUnknown: post.isPinned === null,
      isPromotedUnknown: post.isPromoted === null,
      ratio: null,
      reasons,
      tier: null,
    });
    if (reasons.length > 0) continue;

    const index = selected.findIndex(
      (candidate) => comparePosts(post, candidate) < 0,
    );
    if (index !== -1) {
      selected.splice(index, 0, post);
    } else if (selected.length < options.windowSize) {
      selected.push(post);
    }
    if (selected.length > options.windowSize) selected.pop();
  }

  const contributorIds = selected.map((post) => post.id);
  const contributorSet = new Set(contributorIds);
  const median = calculateMedian(selected, options.minimumSampleSize);

  for (const [index, result] of results.entries()) {
    result.isContributor = contributorSet.has(result.id);
    if (result.reasons.length === 0 && !result.isContributor) {
      result.reasons.push('outside_window');
    }
    if (
      median === null ||
      median === 0 ||
      result.reasons.some(
        (reason) => reason !== 'pinned' && reason !== 'outside_window',
      )
    ) {
      continue;
    }
    const views = posts[index].views;
    if (views === null) continue;
    result.ratio = views / median;
    result.tier =
      result.ratio >= options.breakoutThreshold
        ? 'breakout'
        : result.ratio >= options.outlierThreshold
          ? 'outlier'
          : null;
  }

  return {
    computedAt: new Date(nowMs).toISOString(),
    contributorIds,
    median,
    options,
    posts: results,
    sampleSize: selected.length,
    scope: {
      accountId: scope.accountId,
      contentType: scope.contentType,
      organizationId: scope.organizationId,
      platform: scope.platform,
    },
    status:
      median === null
        ? 'insufficient_data'
        : median === 0
          ? 'zero_baseline'
          : 'ready',
  };
}

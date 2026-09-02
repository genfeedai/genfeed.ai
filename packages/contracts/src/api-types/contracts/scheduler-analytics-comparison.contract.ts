import {
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '../..';
import type {
  IChannelTarget,
  IReleaseAnalyticsComparison,
  IReleaseTargetAnalyticsComparison,
  SchedulerAnalyticsComparisonMetric,
} from '../../interfaces';

export const SCHEDULER_ANALYTICS_COMPARISON_METRICS = [
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'engagementRate',
] as const satisfies readonly SchedulerAnalyticsComparisonMetric[];

function toTargetComparison(
  releaseId: string,
  target: IChannelTarget,
): IReleaseTargetAnalyticsComparison {
  const snapshot =
    target.analytics.state === 'ready' ? target.analytics.snapshot : null;

  return {
    collection: target.analytics.collection,
    metrics: snapshot
      ? {
          comments: snapshot.comments,
          engagementRate: snapshot.engagementRate,
          likes: snapshot.likes,
          saves: snapshot.saves,
          shares: snapshot.shares,
          views: snapshot.views,
        }
      : null,
    platform: target.platform,
    releaseId,
    snapshotIdentity: snapshot
      ? {
          snapshotDate: snapshot.snapshotDate,
          updatedAt: snapshot.updatedAt,
        }
      : null,
    targetId: target.id,
  };
}

function resolveComparisonState(
  targets: readonly IReleaseTargetAnalyticsComparison[],
): IReleaseAnalyticsComparison['state'] {
  if (targets.length === 0) {
    return 'empty';
  }

  const readyTargets = targets.filter((target) => target.metrics !== null);
  const failedTargets = targets.filter(
    (target) =>
      target.collection.state === TargetAnalyticsCollectionState.FAILED,
  );

  if (readyTargets.length === 0) {
    return failedTargets.length > 0 ? 'error' : 'empty';
  }

  const hasUnavailableTarget = targets.some(
    (target) => target.metrics === null,
  );
  const hasFreshTarget = readyTargets.some(
    (target) => target.collection.freshness === TargetAnalyticsFreshness.FRESH,
  );
  const hasStaleTarget = readyTargets.some(
    (target) => target.collection.freshness === TargetAnalyticsFreshness.STALE,
  );

  if (hasUnavailableTarget || (hasFreshTarget && hasStaleTarget)) {
    return 'mixed';
  }

  return hasStaleTarget ? 'stale' : 'ready';
}

/**
 * Builds the single analytics comparison representation consumed by every
 * scheduler read surface. Only explicitly named, provider-normalized metrics
 * are copied; collection errors stay sanitized and provider payloads stay out.
 */
export function buildReleaseAnalyticsComparison(
  releaseId: string,
  targets: readonly IChannelTarget[],
): IReleaseAnalyticsComparison {
  const comparisons = targets.map((target) =>
    toTargetComparison(releaseId, target),
  );

  return {
    metricDefinitions: SCHEDULER_ANALYTICS_COMPARISON_METRICS,
    releaseId,
    state: resolveComparisonState(comparisons),
    targets: comparisons,
  };
}

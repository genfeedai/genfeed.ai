import type {
  XActivityKind,
  XActivityMetricState,
  XActivityRow,
  XActivitySummary,
  XFollowerGrowth,
  XFollowerReset,
  XFollowerSnapshotInput,
  XGrowthPeriod,
  XGrowthReport,
  XGrowthScope,
} from '@api/endpoints/analytics/x-growth-report/x-growth-report.types';
import {
  AnalyticsMetricAvailability,
  DEFAULT_FLEET_EVALUATION_COVERAGE,
  DEFAULT_FLEET_EVALUATION_FRESHNESS_HOURS,
  TargetAnalyticsCollectionState,
} from '@genfeedai/contracts';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** A longest report period; a longer one is several reports. */
export const X_GROWTH_MAX_PERIOD_DAYS = 92;
/** A fall this large between two readings is the account changing, not growth. */
const RESET_DROP_RATIO = 0.3;
const RESET_DROP_MIN_FOLLOWERS = 20;

export const X_DIRECT_CONVERSIONS_UNAVAILABLE =
  'Direct conversions need a consent-aware tracked-link journey, which is not connected to this report.';
export const X_PROFILE_TRAFFIC_UNAVAILABLE =
  'Profile and bio traffic is not measured here; X does not give a profile-click metric.';

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodDays(period: XGrowthPeriod): number {
  return Math.max(
    1,
    Math.ceil(
      (new Date(period.to).getTime() - new Date(period.from).getTime()) /
        DAY_MS,
    ),
  );
}

export function growthScopeKey(
  scope: Pick<XGrowthScope, 'brandId' | 'credentialId' | 'organizationId'>,
  period: XGrowthPeriod,
): string {
  return [
    scope.organizationId,
    scope.brandId,
    scope.credentialId,
    period.from,
    period.to,
  ].join('|');
}

function isObservedFollowers(snapshot: XFollowerSnapshotInput): boolean {
  const availability =
    snapshot.metricAvailability !== null &&
    typeof snapshot.metricAvailability === 'object' &&
    !Array.isArray(snapshot.metricAvailability)
      ? (snapshot.metricAvailability as Record<string, unknown>).followers
      : undefined;
  return (
    availability === AnalyticsMetricAvailability.OBSERVED &&
    typeof snapshot.followers === 'number' &&
    Number.isFinite(snapshot.followers)
  );
}

/**
 * Follower change over the period, from the readings taken inside it. It names
 * the dates it measured between and how much of the period it saw. It gives no
 * number when it saw too little, and it measures only after a suspected reset
 * (the count fell by a third or more at once: another account, a purge), since
 * a change across one is not growth. It is an account-level observation, so it
 * is labelled a correlation, never attributed to a post.
 */
export function buildFollowerGrowth(
  snapshots: XFollowerSnapshotInput[],
  period: XGrowthPeriod,
): XFollowerGrowth {
  const days = periodDays(period);
  const from = new Date(period.from).getTime();
  const to = new Date(period.to).getTime();
  const observed = snapshots
    .filter(isObservedFollowers)
    .filter(
      (snapshot) =>
        snapshot.date.getTime() >= from && snapshot.date.getTime() <= to,
    )
    .map((snapshot) => ({
      date: snapshot.date,
      followers: snapshot.followers as number,
    }))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const resets: XFollowerReset[] = [];
  let segmentStart = 0;
  for (let index = 1; index < observed.length; index += 1) {
    const before = observed[index - 1].followers;
    const now = observed[index].followers;
    const drop = before - now;
    if (drop >= RESET_DROP_MIN_FOLLOWERS && drop >= before * RESET_DROP_RATIO) {
      resets.push({
        date: dayKey(observed[index].date),
        from: before,
        to: now,
      });
      segmentStart = index;
    }
  }
  const measured = observed.slice(segmentStart);
  const observedDays = new Set(measured.map((point) => dayKey(point.date)))
    .size;
  const base = {
    observedDays,
    periodDays: days,
    resets,
  };

  if (observed.length === 0) {
    return { ...base, reason: 'no_snapshots', state: 'insufficient' };
  }
  if (measured.length < 2) {
    return {
      ...base,
      reason:
        segmentStart > 0 ? 'reset_leaves_one_snapshot' : 'single_snapshot',
      state: 'insufficient',
    };
  }
  if (observedDays / days < DEFAULT_FLEET_EVALUATION_COVERAGE) {
    return { ...base, reason: 'low_coverage', state: 'insufficient' };
  }

  const start = measured[0];
  const end = measured[measured.length - 1];
  const maxGapDays = measured.reduce(
    (largest, point, index) =>
      index === 0
        ? largest
        : Math.max(
            largest,
            Math.round(
              (point.date.getTime() - measured[index - 1].date.getTime()) /
                DAY_MS,
            ),
          ),
    0,
  );
  return {
    ...base,
    delta: end.followers - start.followers,
    endDate: dayKey(end.date),
    endFollowers: end.followers,
    maxGapDays,
    relationship: 'correlation',
    startDate: dayKey(start.date),
    startFollowers: start.followers,
    state: 'observed',
  };
}

function metricState(insight: PublicationInsight): XActivityMetricState {
  const sample = insight.latestSample;
  if (!sample) {
    return insight.collectionState === TargetAnalyticsCollectionState.PENDING
      ? 'pending'
      : 'unavailable';
  }
  const metrics = Object.values(sample.metrics);
  const observed = metrics.filter(
    (metric) =>
      metric.availability === AnalyticsMetricAvailability.OBSERVED &&
      metric.value !== null,
  ).length;
  if (observed === metrics.length) {
    return 'observed';
  }
  return observed > 0 ? 'partial' : 'unavailable';
}

export function toActivityRow(
  insight: PublicationInsight,
  now: Date,
): XActivityRow {
  const sampleUpdatedAt = insight.latestSample?.updatedAt ?? null;
  const kind: XActivityKind = insight.publicationKind;
  return {
    collectionMessage: insight.collectionMessage,
    collectionState: insight.collectionState,
    externalId: insight.externalId,
    isStale:
      sampleUpdatedAt !== null &&
      (insight.collectionState === TargetAnalyticsCollectionState.STALE ||
        now.getTime() - new Date(sampleUpdatedAt).getTime() >
          DEFAULT_FLEET_EVALUATION_FRESHNESS_HOURS * HOUR_MS),
    kind,
    metricState: metricState(insight),
    metrics: insight.latestSample?.metrics ?? null,
    postId: insight.id,
    publishedAt: insight.publicationDate,
    sampleUpdatedAt,
    text: insight.description,
    url: insight.urlKind === 'permalink' ? insight.url : null,
  };
}

export function summarizeActivity(rows: XActivityRow[]): XActivitySummary {
  const byKind: Record<XActivityKind, number> = {
    post: 0,
    reply: 0,
    unknown: 0,
  };
  let totalViews = 0;
  let rowsWithObservedViews = 0;
  for (const row of rows) {
    byKind[row.kind] += 1;
    const views = row.metrics?.views;
    if (
      views?.availability === AnalyticsMetricAvailability.OBSERVED &&
      views.value !== null
    ) {
      totalViews += views.value;
      rowsWithObservedViews += 1;
    }
  }
  return {
    byKind,
    rowsWithObservedViews,
    rowsWithStaleMetrics: rows.filter((row) => row.isStale).length,
    totalRows: rows.length,
    totalViews: rowsWithObservedViews > 0 ? totalViews : null,
  };
}

export function buildXGrowthReport(input: {
  isTruncated: boolean;
  now: Date;
  period: XGrowthPeriod;
  publications: PublicationInsight[];
  scope: XGrowthScope;
  snapshots: XFollowerSnapshotInput[];
}): XGrowthReport {
  const rows = input.publications.map((insight) =>
    toActivityRow(insight, input.now),
  );
  return {
    activity: {
      isTruncated: input.isTruncated,
      rows,
      summary: summarizeActivity(rows),
    },
    directConversions: {
      reason: X_DIRECT_CONVERSIONS_UNAVAILABLE,
      state: 'unavailable',
    },
    generatedAt: input.now.toISOString(),
    growth: buildFollowerGrowth(input.snapshots, input.period),
    period: input.period,
    profileTraffic: {
      reason: X_PROFILE_TRAFFIC_UNAVAILABLE,
      state: 'unavailable',
    },
    scope: input.scope,
    scopeKey: growthScopeKey(input.scope, input.period),
  };
}

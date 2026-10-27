import type { XFollowerSnapshotInput } from '@api/endpoints/analytics/x-growth-report/x-growth-report.types';
import {
  buildFollowerGrowth,
  buildXGrowthReport,
  growthScopeKey,
} from '@api/endpoints/analytics/x-growth-report/x-growth-report.util';
import {
  AnalyticsMetricAvailability,
  TargetAnalyticsCollectionState,
} from '@genfeedai/contracts';
import type {
  PublicationInsight,
  PublicationInsightMetrics,
} from '@genfeedai/contracts/interfaces/content/publication-insights.interface';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const PERIOD = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-08T00:00:00.000Z',
};
const SCOPE = {
  brandId: 'brand-1',
  credentialId: 'cred-1',
  handle: 'genfeedai',
  organizationId: 'org-1',
};

function snapshot(
  day: string,
  followers: number | null,
  isObserved = followers !== null,
): XFollowerSnapshotInput {
  return {
    date: new Date(`2026-10-${day}T00:00:00.000Z`),
    followers,
    metricAvailability: {
      followers: isObserved
        ? AnalyticsMetricAvailability.OBSERVED
        : AnalyticsMetricAvailability.UNAVAILABLE,
    },
  };
}

function metrics(
  overrides: Partial<PublicationInsightMetrics> = {},
): PublicationInsightMetrics {
  const observed = (value: number) => ({
    availability: AnalyticsMetricAvailability.OBSERVED,
    value,
  });
  return {
    comments: observed(1),
    likes: observed(2),
    saves: observed(0),
    shares: observed(1),
    views: observed(100),
    ...overrides,
  };
}

function insight(
  id: string,
  overrides: Partial<PublicationInsight> = {},
): PublicationInsight {
  return {
    analyticsAvailability: 'eligible',
    brandId: 'brand-1',
    collectionMessage: null,
    collectionState: TargetAnalyticsCollectionState.READY,
    contextUrl: null,
    credentialId: 'cred-1',
    description: `Post ${id}`,
    externalId: `x-${id}`,
    id,
    isCapturedObservation: false,
    latestSample: {
      date: '2026-10-26T00:00:00.000Z',
      metrics: metrics(),
      updatedAt: '2026-10-26T06:00:00.000Z',
    },
    linkCandidates: [],
    observedVisibility: 'unknown',
    organizationId: 'org-1',
    platform: 'twitter',
    publicationDate: '2026-10-03T10:00:00.000Z',
    publicationKind: 'post',
    source: null,
    url: `https://x.com/genfeedai/status/${id}`,
    urlIdentity: null,
    urlKind: 'permalink',
    ...overrides,
  } as PublicationInsight;
}

describe('buildFollowerGrowth', () => {
  it('reports the observed endpoints, dates and coverage, labelled a correlation', () => {
    const growth = buildFollowerGrowth(
      [
        snapshot('01', 1000),
        snapshot('03', 1010),
        snapshot('05', 1030),
        snapshot('07', 1050),
      ],
      PERIOD,
    );

    expect(growth).toMatchObject({
      delta: 50,
      endDate: '2026-10-07',
      endFollowers: 1050,
      maxGapDays: 2,
      observedDays: 4,
      periodDays: 7,
      relationship: 'correlation',
      startDate: '2026-10-01',
      startFollowers: 1000,
      state: 'observed',
    });
  });

  it('gives no number without snapshots, with one, or with too little coverage', () => {
    expect(buildFollowerGrowth([], PERIOD)).toMatchObject({
      reason: 'no_snapshots',
      state: 'insufficient',
    });
    expect(buildFollowerGrowth([snapshot('02', 900)], PERIOD)).toMatchObject({
      reason: 'single_snapshot',
      state: 'insufficient',
    });
    expect(
      buildFollowerGrowth([snapshot('01', 900), snapshot('07', 950)], PERIOD),
    ).toMatchObject({
      observedDays: 2,
      reason: 'low_coverage',
      state: 'insufficient',
    });
  });

  it('ignores a snapshot whose followers were not observed, and ones outside the period', () => {
    const growth = buildFollowerGrowth(
      [
        snapshot('01', 1000),
        snapshot('02', 0, false),
        snapshot('03', 1005),
        snapshot('04', 1010),
        snapshot('05', 1015),
        { ...snapshot('01', 5), date: new Date('2026-09-20T00:00:00.000Z') },
      ],
      PERIOD,
    );

    expect(growth).toMatchObject({
      delta: 15,
      observedDays: 4,
      state: 'observed',
    });
  });

  it('measures only after a suspected reset and reports it', () => {
    const growth = buildFollowerGrowth(
      [
        snapshot('01', 5000),
        snapshot('02', 5010),
        snapshot('03', 800),
        snapshot('04', 810),
        snapshot('05', 830),
        snapshot('06', 850),
      ],
      PERIOD,
    );

    expect(growth).toMatchObject({
      delta: 50,
      resets: [{ date: '2026-10-03', from: 5010, to: 800 }],
      startFollowers: 800,
      state: 'observed',
    });
  });

  it('gives no number when a reset leaves one reading', () => {
    expect(
      buildFollowerGrowth(
        [snapshot('01', 5000), snapshot('02', 5010), snapshot('03', 800)],
        PERIOD,
      ),
    ).toMatchObject({
      reason: 'reset_leaves_one_snapshot',
      state: 'insufficient',
    });
  });

  it('treats a small account losing a few followers as ordinary change', () => {
    const growth = buildFollowerGrowth(
      [
        snapshot('01', 30),
        snapshot('03', 25),
        snapshot('05', 27),
        snapshot('07', 31),
      ],
      PERIOD,
    );

    expect(growth).toMatchObject({ delta: 1, resets: [], state: 'observed' });
  });
});

describe('buildXGrowthReport', () => {
  const report = (publications: PublicationInsight[], isTruncated = false) =>
    buildXGrowthReport({
      isTruncated,
      now: NOW,
      period: PERIOD,
      publications,
      scope: SCOPE,
      snapshots: [],
    });

  it('keeps the exact publication identity, kind and own permalink of each row', () => {
    const { activity } = report([
      insight('1'),
      insight('2', { publicationKind: 'reply' }),
      insight('3', {
        url: 'https://x.com/someone/status/9',
        urlKind: 'context-only',
      }),
    ]);

    expect(activity.rows[0]).toMatchObject({
      externalId: 'x-1',
      kind: 'post',
      metricState: 'observed',
      postId: '1',
      url: 'https://x.com/genfeedai/status/1',
    });
    expect(activity.rows[1].kind).toBe('reply');
    // A parent's context URL is not the publication's own address.
    expect(activity.rows[2].url).toBeNull();
    expect(activity.summary.byKind).toEqual({ post: 2, reply: 1, unknown: 0 });
  });

  it('shows missing, pending, failed and stale metrics as such, never a zero', () => {
    const failed = insight('f', {
      collectionMessage: 'X refused the metrics request.',
      collectionState: TargetAnalyticsCollectionState.FAILED,
      latestSample: null,
    });
    const pending = insight('p', {
      collectionState: TargetAnalyticsCollectionState.PENDING,
      latestSample: null,
    });
    const stale = insight('s', {
      latestSample: {
        date: '2026-10-20T00:00:00.000Z',
        metrics: metrics(),
        updatedAt: '2026-10-20T06:00:00.000Z',
      },
    });
    const partial = insight('x', {
      latestSample: {
        date: '2026-10-26T00:00:00.000Z',
        metrics: metrics({
          saves: {
            availability: AnalyticsMetricAvailability.UNAVAILABLE,
            value: null,
          },
        }),
        updatedAt: '2026-10-26T06:00:00.000Z',
      },
    });

    const { activity } = report([failed, pending, stale, partial]);

    expect(activity.rows.map((row) => row.metricState)).toEqual([
      'unavailable',
      'pending',
      'observed',
      'partial',
    ]);
    expect(activity.rows[0]).toMatchObject({
      collectionMessage: 'X refused the metrics request.',
      metrics: null,
    });
    expect(activity.rows[2].isStale).toBe(true);
    expect(activity.rows[3].isStale).toBe(false);
    expect(activity.summary).toMatchObject({
      rowsWithObservedViews: 2,
      rowsWithStaleMetrics: 1,
      totalViews: 200,
    });
  });

  it('gives no view total when no row has observed views', () => {
    const { activity } = report([insight('f', { latestSample: null })]);

    expect(activity.summary.totalViews).toBeNull();
    expect(activity.summary.rowsWithObservedViews).toBe(0);
  });

  it('says what it cannot measure and carries the scope that bounds it', () => {
    const result = report([], true);

    expect(result.activity.isTruncated).toBe(true);
    expect(result.directConversions.state).toBe('unavailable');
    expect(result.profileTraffic.state).toBe('unavailable');
    expect(result.scopeKey).toBe(growthScopeKey(SCOPE, PERIOD));
    expect(result.scopeKey).not.toBe(
      growthScopeKey({ ...SCOPE, credentialId: 'cred-2' }, PERIOD),
    );
    expect(result.scopeKey).not.toBe(
      growthScopeKey(SCOPE, { ...PERIOD, to: '2026-10-09T00:00:00.000Z' }),
    );
  });
});

import { TargetExecutionState } from '@genfeedai/contracts';
import type {
  AccountHealthSummary,
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { buildCadenceGaps } from './cadence-gaps.util';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function buildAccountHealth(
  overrides: Partial<AccountHealthSummary> = {},
): AccountHealthSummary {
  return {
    credentialId: 'credential-1',
    holdPublishing: false,
    label: 'Brand Instagram',
    override: { isActive: false },
    platform: 'instagram' as AccountHealthSummary['platform'],
    riskLevel: 'low',
    score: 90,
    signals: {
      connectedDays: 30,
      profileSignals: 3,
      publishedPosts: 10,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 3,
      minConnectedDays: 7,
      minProfileSignals: 1,
      minPublishedPosts: 1,
    },
    ...overrides,
  };
}

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    analytics: {
      collection: null as never,
      snapshot: null,
      state: 'unavailable',
    },
    attachments: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    credentialId: 'credential-1',
    executionState: TargetExecutionState.PUBLISHED,
    id: 'target-1',
    idempotencyKey: null,
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: 'instagram' as IChannelTarget['platform'],
    publishedAt: null,
    readiness: null,
    releaseId: 'release-1',
    retryCount: 0,
    scheduledAt: null,
    settings: {},
    source: 'manual' as IChannelTarget['source'],
    statusTransitions: [],
    timezone: 'UTC',
    updatedAt: '2026-08-01T00:00:00.000Z',
    validationIssues: [],
    validationState: 'valid' as IChannelTarget['validationState'],
    visibility: 'public' as IChannelTarget['visibility'],
    workflowExecutionId: null,
    ...overrides,
  };
}

function buildRelease(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    analyticsComparison: {
      metricDefinitions: [],
      releaseId: 'release-1',
      state: 'empty',
      targets: [],
    },
    baseContent: 'Hello world',
    createdAt: '2026-08-01T00:00:00.000Z',
    id: 'release-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    scheduledAt: null,
    status: 'published' as IReleaseGroup['status'],
    targets: [],
    timezone: 'UTC',
    title: 'Launch announcement',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCadenceGaps', () => {
  it('computes the gap in days since the last published target', () => {
    const accountHealth = [buildAccountHealth()];
    const postedReleases = [
      buildRelease({
        targets: [buildTarget({ publishedAt: '2026-08-27T12:00:00.000Z' })],
      }),
    ];

    const gaps = buildCadenceGaps(
      { accountHealth, postedReleases, upcomingReleases: [] },
      NOW,
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.gapDays).toBe(5);
    expect(gaps[0]?.hasUpcoming).toBe(false);
  });

  it('reports a null gap and sorts never-published accounts first', () => {
    const accountHealth = [
      buildAccountHealth({
        credentialId: 'credential-recent',
        label: 'Recent',
      }),
      buildAccountHealth({
        credentialId: 'credential-silent',
        label: 'Silent',
      }),
    ];
    const postedReleases = [
      buildRelease({
        targets: [
          buildTarget({
            credentialId: 'credential-recent',
            publishedAt: '2026-08-31T12:00:00.000Z',
          }),
        ],
      }),
    ];

    const gaps = buildCadenceGaps(
      { accountHealth, postedReleases, upcomingReleases: [] },
      NOW,
    );

    expect(gaps[0]?.accountLabel).toBe('Silent');
    expect(gaps[0]?.gapDays).toBeNull();
    expect(gaps[1]?.accountLabel).toBe('Recent');
    expect(gaps[1]?.gapDays).toBe(1);
  });

  it('marks hasUpcoming when a scheduled target exists for the credential', () => {
    const accountHealth = [buildAccountHealth()];
    const upcomingReleases = [
      buildRelease({
        targets: [
          buildTarget({ executionState: TargetExecutionState.SCHEDULED }),
        ],
      }),
    ];

    const gaps = buildCadenceGaps(
      { accountHealth, postedReleases: [], upcomingReleases },
      NOW,
    );

    expect(gaps[0]?.hasUpcoming).toBe(true);
  });

  it('surfaces reconnect and hold-publishing state from account health', () => {
    const accountHealth = [
      buildAccountHealth({
        holdPublishing: true,
        reconnect: {
          credentialId: 'credential-1',
          isAvailable: true,
          reason: 'disconnected',
        },
      }),
    ];

    const gaps = buildCadenceGaps(
      { accountHealth, postedReleases: [], upcomingReleases: [] },
      NOW,
    );

    expect(gaps[0]?.needsReconnect).toBe(true);
    expect(gaps[0]?.holdPublishing).toBe(true);
  });
});

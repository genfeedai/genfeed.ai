import { TargetExecutionState } from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import { buildNext24hQueue } from './next-24h-queue.util';

const NOW = new Date('2026-09-01T12:00:00.000Z');

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    analytics: {
      collection: null as never,
      snapshot: null,
      state: 'unavailable',
    },
    attachments: [],
    category: undefined,
    createdAt: '2026-08-01T00:00:00.000Z',
    credentialId: 'credential-1',
    executionState: TargetExecutionState.SCHEDULED,
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
    status: 'scheduled' as IReleaseGroup['status'],
    targets: [],
    timezone: 'UTC',
    title: 'Launch announcement',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildNext24hQueue', () => {
  it('drops targets outside the 24h window and those that are not scheduled', () => {
    const releases = [
      buildRelease({
        id: 'release-past',
        targets: [
          buildTarget({
            id: 'target-past',
            releaseId: 'release-past',
            scheduledAt: '2026-09-01T11:00:00.000Z',
          }),
        ],
      }),
      buildRelease({
        id: 'release-too-far',
        targets: [
          buildTarget({
            id: 'target-too-far',
            releaseId: 'release-too-far',
            scheduledAt: '2026-09-03T00:00:00.000Z',
          }),
        ],
      }),
      buildRelease({
        id: 'release-not-scheduled',
        targets: [
          buildTarget({
            executionState: TargetExecutionState.PUBLISHED,
            id: 'target-not-scheduled',
            releaseId: 'release-not-scheduled',
            scheduledAt: '2026-09-01T13:00:00.000Z',
          }),
        ],
      }),
    ];

    expect(buildNext24hQueue(releases, NOW)).toEqual([]);
  });

  it('groups targets into near (3h) and later (24h) buckets, sorted earliest first', () => {
    const releases = [
      buildRelease({
        id: 'release-later',
        targets: [
          buildTarget({
            id: 'target-later',
            releaseId: 'release-later',
            scheduledAt: '2026-09-02T00:00:00.000Z',
          }),
        ],
        title: 'Later post',
      }),
      buildRelease({
        id: 'release-near-2',
        targets: [
          buildTarget({
            id: 'target-near-2',
            releaseId: 'release-near-2',
            scheduledAt: '2026-09-01T13:30:00.000Z',
          }),
        ],
        title: 'Near post 2',
      }),
      buildRelease({
        id: 'release-near-1',
        targets: [
          buildTarget({
            id: 'target-near-1',
            releaseId: 'release-near-1',
            scheduledAt: '2026-09-01T12:15:00.000Z',
          }),
        ],
        title: 'Near post 1',
      }),
    ];

    const groups = buildNext24hQueue(releases, NOW);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.bucket).toBe('near');
    expect(groups[0]?.items.map((item) => item.title)).toEqual([
      'Near post 1',
      'Near post 2',
    ]);
    expect(groups[1]?.bucket).toBe('later');
    expect(groups[1]?.items.map((item) => item.title)).toEqual(['Later post']);
  });

  it('falls back to the release scheduledAt when the target has none', () => {
    const releases = [
      buildRelease({
        id: 'release-fallback',
        scheduledAt: '2026-09-01T14:00:00.000Z',
        targets: [
          buildTarget({
            id: 'target-fallback',
            releaseId: 'release-fallback',
            scheduledAt: null,
          }),
        ],
      }),
    ];

    const groups = buildNext24hQueue(releases, NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items[0]?.scheduledAt).toBe('2026-09-01T14:00:00.000Z');
  });
});

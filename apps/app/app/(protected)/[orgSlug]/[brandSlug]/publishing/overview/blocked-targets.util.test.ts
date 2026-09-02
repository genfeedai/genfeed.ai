import { TargetExecutionState } from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildBlockedTargetGroups,
  UNKNOWN_ERROR_CODE,
} from './blocked-targets.util';

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
    executionState: TargetExecutionState.FAILED,
    id: 'target-1',
    idempotencyKey: null,
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: 'instagram' as IChannelTarget['platform'],
    publishedAt: null,
    readiness: null,
    releaseId: 'release-1',
    retryCount: 1,
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
    status: 'failed' as IReleaseGroup['status'],
    targets: [],
    timezone: 'UTC',
    title: 'Launch announcement',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildBlockedTargetGroups', () => {
  it('ignores targets that are not FAILED', () => {
    const releases = [
      buildRelease({
        targets: [
          buildTarget({ executionState: TargetExecutionState.PUBLISHED }),
        ],
      }),
    ];

    expect(buildBlockedTargetGroups(releases)).toEqual([]);
  });

  it('groups failed targets by error code and dedupes accounts', () => {
    const releases = [
      buildRelease({
        id: 'release-a',
        targets: [
          buildTarget({
            credentialId: 'credential-a',
            error: {
              code: 'RATE_LIMITED',
              isRetryable: true,
              message: 'Too many requests',
            },
            id: 'target-a',
            releaseId: 'release-a',
          }),
        ],
      }),
      buildRelease({
        id: 'release-b',
        targets: [
          buildTarget({
            credentialId: 'credential-a',
            error: {
              code: 'RATE_LIMITED',
              isRetryable: true,
              message: 'Too many requests',
            },
            id: 'target-b',
            releaseId: 'release-b',
          }),
          buildTarget({
            credentialId: 'credential-b',
            error: {
              code: 'TOKEN_EXPIRED',
              isRetryable: false,
              message: 'Reconnect required',
            },
            id: 'target-c',
            platform: 'tiktok' as IChannelTarget['platform'],
            releaseId: 'release-b',
          }),
        ],
      }),
    ];

    const groups = buildBlockedTargetGroups(releases);

    expect(groups).toHaveLength(2);
    const rateLimited = groups.find((group) => group.code === 'RATE_LIMITED');
    expect(rateLimited?.count).toBe(2);
    expect(rateLimited?.accounts).toHaveLength(1);

    const tokenExpired = groups.find((group) => group.code === 'TOKEN_EXPIRED');
    expect(tokenExpired?.count).toBe(1);
  });

  it('falls back to an explicit unknown code when a FAILED target has no error', () => {
    const releases = [
      buildRelease({
        targets: [buildTarget({ error: null })],
      }),
    ];

    const groups = buildBlockedTargetGroups(releases);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.code).toBe(UNKNOWN_ERROR_CODE);
  });
});

import { describe, expect, test } from 'vitest';
import {
  CredentialPlatform,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '../../src';
import { buildReleaseAnalyticsComparison } from '../../src/api-types/contracts/scheduler-analytics-comparison.contract';
import type { IChannelTarget } from '../../src/interfaces';

function target(
  id: string,
  input:
    | { state: 'fresh' | 'stale'; views: number }
    | { state: 'empty' | 'error' },
): IChannelTarget {
  const collectionState =
    input.state === 'fresh'
      ? TargetAnalyticsCollectionState.READY
      : input.state === 'stale'
        ? TargetAnalyticsCollectionState.STALE
        : input.state === 'error'
          ? TargetAnalyticsCollectionState.FAILED
          : TargetAnalyticsCollectionState.UNAVAILABLE;
  const freshness =
    input.state === 'fresh'
      ? TargetAnalyticsFreshness.FRESH
      : input.state === 'stale'
        ? TargetAnalyticsFreshness.STALE
        : TargetAnalyticsFreshness.UNAVAILABLE;
  const collection = {
    capability: TargetAnalyticsCapability.SUPPORTED,
    error:
      input.state === 'error'
        ? {
            code: 'provider_timeout',
            failedAt: '2026-07-27T10:05:00.000Z',
            isRetryable: true,
            message: 'Provider timed out.',
          }
        : null,
    freshness,
    lastCollectedAt: null,
    requestedAt: '2026-07-27T10:00:00.000Z',
    state: collectionState,
  };
  const analytics =
    input.state === 'fresh' || input.state === 'stale'
      ? {
          collection,
          snapshot: {
            comments: 3,
            engagementRate: 0.14,
            likes: 12,
            saves: 2,
            shares: 4,
            snapshotDate: '2026-07-27',
            updatedAt: '2026-07-27T10:00:00.000Z',
            views: input.views,
          },
          state: 'ready' as const,
        }
      : {
          collection,
          snapshot: null,
          state: 'unavailable' as const,
        };

  return {
    analytics,
    id,
    platform:
      id === 'target-1'
        ? CredentialPlatform.INSTAGRAM
        : CredentialPlatform.LINKEDIN,
    releaseId: 'release-1',
  } as IChannelTarget;
}

describe('buildReleaseAnalyticsComparison', () => {
  test.each([
    ['ready', [target('target-1', { state: 'fresh', views: 100 })]],
    ['stale', [target('target-1', { state: 'stale', views: 100 })]],
    [
      'mixed',
      [
        target('target-1', { state: 'fresh', views: 100 }),
        target('target-2', { state: 'empty' }),
      ],
    ],
    ['empty', [target('target-1', { state: 'empty' })]],
    ['error', [target('target-1', { state: 'error' })]],
  ])('reports the %s release state', (state, targets) => {
    expect(buildReleaseAnalyticsComparison('release-1', targets).state).toBe(
      state,
    );
  });

  test('copies only named metrics with snapshot and freshness evidence', () => {
    const result = buildReleaseAnalyticsComparison('release-1', [
      target('target-1', { state: 'fresh', views: 100 }),
    ]);

    expect(result.metricDefinitions).toEqual([
      'views',
      'likes',
      'comments',
      'shares',
      'saves',
      'engagementRate',
    ]);
    expect(result.targets[0]).toMatchObject({
      collection: { freshness: TargetAnalyticsFreshness.FRESH },
      metrics: {
        comments: 3,
        engagementRate: 0.14,
        likes: 12,
        saves: 2,
        shares: 4,
        views: 100,
      },
      releaseId: 'release-1',
      snapshotIdentity: {
        snapshotDate: '2026-07-27',
        updatedAt: '2026-07-27T10:00:00.000Z',
      },
      targetId: 'target-1',
    });
    expect(result.targets[0]).not.toHaveProperty('providerDetail');
  });
});

import {
  CredentialPlatform,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '@genfeedai/enums';
import type { IReleaseAnalyticsComparison } from '@genfeedai/interfaces';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import {
  createAnalyticsFeedbackExecutor,
  toAnalyticsFeedbackReleaseEvidence,
} from './analytics-feedback-executor';

const comparison: IReleaseAnalyticsComparison = {
  metricDefinitions: [
    'views',
    'likes',
    'comments',
    'shares',
    'saves',
    'engagementRate',
  ],
  releaseId: 'release-1',
  state: 'ready',
  targets: [
    {
      collection: {
        capability: TargetAnalyticsCapability.SUPPORTED,
        error: null,
        freshness: TargetAnalyticsFreshness.FRESH,
        lastCollectedAt: '2026-07-27T10:00:00.000Z',
        requestedAt: '2026-07-27T09:59:00.000Z',
        state: TargetAnalyticsCollectionState.READY,
      },
      metrics: {
        comments: 3,
        engagementRate: 0.14,
        likes: 12,
        saves: 2,
        shares: 4,
        views: 100,
      },
      platform: CredentialPlatform.INSTAGRAM,
      releaseId: 'release-1',
      snapshotIdentity: {
        snapshotDate: '2026-07-27',
        updatedAt: '2026-07-27T10:00:00.000Z',
      },
      targetId: 'target-1',
    },
  ],
};

describe('AnalyticsFeedbackExecutor release evidence', () => {
  it('keeps target, snapshot, named metrics, and freshness in evidence', () => {
    expect(toAnalyticsFeedbackReleaseEvidence(comparison)).toEqual({
      releaseId: 'release-1',
      state: 'ready',
      targets: [
        {
          freshness: TargetAnalyticsFreshness.FRESH,
          metrics: comparison.targets[0].metrics,
          platform: CredentialPlatform.INSTAGRAM,
          releaseId: 'release-1',
          snapshotIdentity: comparison.targets[0].snapshotIdentity,
          targetId: 'target-1',
        },
      ],
    });
  });

  it('adds read-only release evidence to resolved recommendations', async () => {
    const resolver = vi.fn().mockResolvedValue({
      avgEngagementRate: 0.1,
      bestPlatform: 'instagram',
      bestPostingTimes: [],
      topHooks: [],
      topTopics: [],
      weekOverWeekChange: 2,
      weekOverWeekDirection: 'up',
      worstTopics: [],
    });
    const context: ExecutionContext = {
      organizationId: 'org-1',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'workflow-1',
    };
    const inputs = new Map<string, unknown>([['releaseAnalytics', comparison]]);

    const result = await createAnalyticsFeedbackExecutor(resolver).execute({
      context,
      inputs,
      node: {
        config: { brandId: 'brand-1' },
        id: 'analytics-1',
        inputs: [],
        label: 'Analytics feedback',
        type: 'analyticsFeedback',
      },
    });

    expect(result.data).toMatchObject({
      releaseEvidence: {
        releaseId: 'release-1',
        targets: [{ targetId: 'target-1' }],
      },
    });
  });
});

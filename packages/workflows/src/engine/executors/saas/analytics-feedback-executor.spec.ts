import {
  CredentialPlatform,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
} from '@genfeedai/contracts';
import type { IReleaseAnalyticsComparison } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import {
  AnalyticsFeedbackExecutor,
  createAnalyticsFeedbackExecutor,
  toAnalyticsFeedbackReleaseEvidence,
} from './analytics-feedback-executor';

const executionContext: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'run-1',
  userId: 'user-1',
  workflowId: 'workflow-1',
};

function makeNode(config: Record<string, unknown> = {}): ExecutableNode {
  return {
    config,
    id: 'analytics-1',
    inputs: [],
    label: 'Analytics feedback',
    type: 'analyticsFeedback',
  };
}

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
    const inputs = new Map<string, unknown>([['releaseAnalytics', comparison]]);

    const result = await createAnalyticsFeedbackExecutor(resolver).execute({
      context: executionContext,
      inputs,
      node: makeNode({ brandId: 'brand-1' }),
    });

    expect(result.data).toMatchObject({
      releaseEvidence: {
        releaseId: 'release-1',
        targets: [{ targetId: 'target-1' }],
      },
    });
  });

  it.each([[null], [undefined]])(
    'returns null evidence for %s comparisons',
    (value) => {
      expect(toAnalyticsFeedbackReleaseEvidence(value)).toBeNull();
    },
  );
});

describe('AnalyticsFeedbackExecutor.validate', () => {
  it('accepts a node with no optional bounds set', () => {
    const executor = new AnalyticsFeedbackExecutor();
    expect(executor.validate(makeNode())).toEqual({ errors: [], valid: true });
  });

  it('accepts in-range topN and worstN', () => {
    const executor = new AnalyticsFeedbackExecutor();
    expect(executor.validate(makeNode({ topN: 1, worstN: 50 }))).toEqual({
      errors: [],
      valid: true,
    });
  });

  it.each([[0], [51], ['5']])('rejects an out-of-range topN (%s)', (topN) => {
    const executor = new AnalyticsFeedbackExecutor();
    expect(executor.validate(makeNode({ topN }))).toEqual({
      errors: ['topN must be between 1 and 50'],
      valid: false,
    });
  });

  it.each([[0], [51], ['5']])(
    'rejects an out-of-range worstN (%s)',
    (worstN) => {
      const executor = new AnalyticsFeedbackExecutor();
      expect(executor.validate(makeNode({ worstN }))).toEqual({
        errors: ['worstN must be between 1 and 50'],
        valid: false,
      });
    },
  );

  it('reports the base node-type error alongside bound errors', () => {
    const executor = new AnalyticsFeedbackExecutor();
    const result = executor.validate({
      ...makeNode({ topN: 99, worstN: 99 }),
      type: 'somethingElse',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Expected node type analyticsFeedback, got somethingElse',
      'topN must be between 1 and 50',
      'worstN must be between 1 and 50',
    ]);
  });
});

describe('AnalyticsFeedbackExecutor.execute', () => {
  it('throws when no resolver is configured', async () => {
    const executor = new AnalyticsFeedbackExecutor();

    await expect(
      executor.execute({
        context: executionContext,
        inputs: new Map<string, unknown>(),
        node: makeNode({ brandId: 'brand-1' }),
      }),
    ).rejects.toThrow('Analytics feedback resolver not configured');
  });

  it('skips with an empty recommendation set when no brand can be resolved', async () => {
    const resolver = vi.fn();
    const result = await createAnalyticsFeedbackExecutor(resolver).execute({
      context: executionContext,
      inputs: new Map<string, unknown>(),
      node: makeNode(),
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(result.metadata).toEqual({ reason: 'no_brand_id', skipped: true });
    expect(result.data).toEqual({
      avgEngagementRate: 0,
      bestPlatform: null,
      bestPostingTimes: [],
      releaseEvidence: null,
      topHooks: [],
      topTopics: [],
      weekOverWeekChange: 0,
      weekOverWeekDirection: 'stable',
      worstTopics: [],
    });
  });

  it('falls back to the brand id carried on the execution context', async () => {
    const resolver = vi.fn().mockResolvedValue({
      avgEngagementRate: 0.2,
      bestPlatform: 'tiktok',
      bestPostingTimes: [{ avgEngagement: 0.3, dayOfWeek: 2, hour: 18 }],
      topHooks: ['hook'],
      topTopics: ['topic'],
      weekOverWeekChange: -1,
      weekOverWeekDirection: 'down',
      worstTopics: ['bad'],
    });

    const result = await createAnalyticsFeedbackExecutor(resolver).execute({
      context: {
        ...executionContext,
        brandId: 'brand-from-context',
      } as ExecutionContext,
      inputs: new Map<string, unknown>(),
      node: makeNode(),
    });

    expect(resolver).toHaveBeenCalledWith({
      brandId: 'brand-from-context',
      organizationId: 'org-1',
      topN: 5,
      worstN: 5,
    });
    expect(result.data).toMatchObject({
      bestPlatform: 'tiktok',
      releaseEvidence: null,
    });
    expect(typeof result.metadata?.resolvedAt).toBe('string');
  });

  it('passes configured topN and worstN through to the resolver', async () => {
    const resolver = vi.fn().mockResolvedValue({
      avgEngagementRate: 0,
      bestPlatform: null,
      bestPostingTimes: [],
      topHooks: [],
      topTopics: [],
      weekOverWeekChange: 0,
      weekOverWeekDirection: 'stable',
      worstTopics: [],
    });

    await createAnalyticsFeedbackExecutor(resolver).execute({
      context: executionContext,
      inputs: new Map<string, unknown>(),
      node: makeNode({ brandId: 'brand-1', topN: 3, worstN: 7 }),
    });

    expect(resolver).toHaveBeenCalledWith({
      brandId: 'brand-1',
      organizationId: 'org-1',
      topN: 3,
      worstN: 7,
    });
  });

  it('creates an executor without a resolver when none is supplied', () => {
    expect(createAnalyticsFeedbackExecutor().nodeType).toBe(
      'analyticsFeedback',
    );
  });
});

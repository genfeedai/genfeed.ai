import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createEngagementTriggerExecutor,
  type EngagementChecker,
  type EngagementTriggerExecutor,
} from '@workflow-engine/executors/saas/engagement-trigger-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'Engagement Trigger',
    type: 'engagementTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('EngagementTriggerExecutor', () => {
  let executor: EngagementTriggerExecutor;
  let mockChecker: EngagementChecker;

  beforeEach(() => {
    executor = createEngagementTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      currentValue: 150,
      metricType: 'likes',
      platform: 'twitter',
      postId: 'post-1',
      postUrl: 'https://x.com/us/status/post-1',
      threshold: 100,
      triggeredAt: '2026-02-22T20:00:00Z',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('engagementTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = createEngagementTriggerExecutor();
    const input = makeInput({
      metricType: 'likes',
      platform: 'twitter',
      threshold: 100,
    });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns engagement data when matched', async () => {
    const input = makeInput({
      metricType: 'likes',
      platform: 'twitter',
      threshold: 100,
    });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({
      currentValue: 150,
      matched: true,
      metricType: 'likes',
      postId: 'post-1',
      threshold: 100,
    });
    expect(result.data).toMatchObject({
      currentValue: 150,
      postId: 'post-1',
    });
  });

  it('returns null when no match', async () => {
    (mockChecker as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const input = makeInput({
      metricType: 'likes',
      platform: 'twitter',
      threshold: 100,
    });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({
      matched: false,
      metricType: 'likes',
    });
    expect(result.data).toBeNull();
  });

  it('passes postIds and threshold to checker', async () => {
    const input = makeInput({
      metricType: 'comments',
      platform: 'instagram',
      postIds: ['p1', 'p2'],
      threshold: 50,
    });
    await executor.execute(input);
    expect(mockChecker).toHaveBeenCalledWith(
      expect.objectContaining({
        metricType: 'comments',
        platform: 'instagram',
        postIds: ['p1', 'p2'],
        threshold: 50,
      }),
    );
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { metricType: 'likes', platform: 'tiktok', threshold: 100 },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });

  it('validates metric type', () => {
    const node: ExecutableNode = {
      config: { metricType: 'followers', platform: 'twitter', threshold: 100 },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid metric type');
  });

  it('validates threshold is required', () => {
    const node: ExecutableNode = {
      config: { metricType: 'likes', platform: 'twitter' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Threshold must be a positive number');
  });

  it('validates threshold must be positive', () => {
    const node: ExecutableNode = {
      config: { metricType: 'likes', platform: 'twitter', threshold: 0 },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Threshold must be a positive number');
  });

  it('validates threshold must be a number', () => {
    const node: ExecutableNode = {
      config: {
        metricType: 'likes',
        platform: 'twitter',
        threshold: 'high',
      },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Threshold must be a positive number');
  });

  it('accepts valid config', () => {
    const node: ExecutableNode = {
      config: {
        metricType: 'shares',
        platform: 'threads',
        threshold: 25,
      },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    expect(executor.validate(node).valid).toBe(true);
  });

  it('estimates cost as zero', () => {
    const node: ExecutableNode = {
      config: { metricType: 'likes', platform: 'twitter', threshold: 100 },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'engagementTrigger',
    };
    expect(executor.estimateCost(node)).toBe(0);
  });
});

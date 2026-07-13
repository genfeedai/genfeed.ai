import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  type NewLikeChecker,
  NewLikeTriggerExecutor,
} from './new-like-trigger-executor';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'New Like',
    type: 'newLikeTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('NewLikeTriggerExecutor', () => {
  let executor: NewLikeTriggerExecutor;
  let mockChecker: NewLikeChecker;

  beforeEach(() => {
    executor = new NewLikeTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      likedAt: '2026-02-21T20:00:00Z',
      likerId: 'l-1',
      likerUsername: 'fan',
      platform: 'twitter',
      postId: 'post-1',
      postUrl: 'https://x.com/us/status/post-1',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('newLikeTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = new NewLikeTriggerExecutor();
    const input = makeInput({ platform: 'twitter' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns like data when matched', async () => {
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: true });
    expect(result.data).toMatchObject({ likerId: 'l-1' });
  });

  it('returns null when no match', async () => {
    (mockChecker as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.data).toBeNull();
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'threads' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'newLikeTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });
});

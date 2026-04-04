import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createNewRepostTriggerExecutor,
  type NewRepostChecker,
  NewRepostTriggerExecutor,
} from '@workflow-engine/executors/saas/new-repost-trigger-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'New Repost',
    type: 'newRepostTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('NewRepostTriggerExecutor', () => {
  let executor: NewRepostTriggerExecutor;
  let mockChecker: NewRepostChecker;

  beforeEach(() => {
    executor = createNewRepostTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      platform: 'twitter',
      postId: 'post-1',
      postUrl: 'https://x.com/us/status/post-1',
      repostedAt: '2026-02-21T20:00:00Z',
      reposterId: 'r-1',
      reposterUsername: 'fan',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('newRepostTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = createNewRepostTriggerExecutor();
    const input = makeInput({ platform: 'twitter' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns repost data when matched', async () => {
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: true });
    expect(result.data).toMatchObject({ reposterId: 'r-1' });
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
      type: 'newRepostTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  type NewFollowerChecker,
  NewFollowerTriggerExecutor,
} from './new-follower-trigger-executor';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'New Follower',
    type: 'newFollowerTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('NewFollowerTriggerExecutor', () => {
  let executor: NewFollowerTriggerExecutor;
  let mockChecker: NewFollowerChecker;

  beforeEach(() => {
    executor = new NewFollowerTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      followedAt: '2026-02-21T20:00:00Z',
      followerId: 'f-1',
      followerUsername: 'newguy',
      platform: 'twitter',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('newFollowerTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = new NewFollowerTriggerExecutor();
    const input = makeInput({ platform: 'twitter' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns follower data when matched', async () => {
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: true });
    expect(result.data).toMatchObject({ followerId: 'f-1' });
  });

  it('returns null when no match', async () => {
    (mockChecker as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: false });
    expect(result.data).toBeNull();
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'tiktok' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'newFollowerTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });
});

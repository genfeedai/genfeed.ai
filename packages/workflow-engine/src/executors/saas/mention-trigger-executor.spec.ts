import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createMentionTriggerExecutor,
  type MentionChecker,
  type MentionTriggerExecutor,
} from '@workflow-engine/executors/saas/mention-trigger-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'trigger-1',
    inputs: [],
    label: 'Mention Trigger',
    type: 'mentionTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('MentionTriggerExecutor', () => {
  let executor: MentionTriggerExecutor;
  let mockChecker: MentionChecker;

  beforeEach(() => {
    executor = createMentionTriggerExecutor();
    mockChecker = vi.fn().mockResolvedValue({
      authorId: 'a-1',
      authorUsername: 'someone',
      mentionedAt: '2026-02-21T20:00:00Z',
      platform: 'twitter',
      postId: 'post-1',
      postUrl: 'https://x.com/someone/status/post-1',
      text: 'Hey @us!',
    });
    executor.setChecker(mockChecker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('mentionTrigger');
  });

  it('throws if checker not configured', async () => {
    const fresh = createMentionTriggerExecutor();
    const input = makeInput({ platform: 'twitter' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'checker not configured',
    );
  });

  it('returns mention data when matched', async () => {
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: true, postId: 'post-1' });
    expect(result.data).toMatchObject({ postId: 'post-1' });
  });

  it('returns null when no match', async () => {
    (mockChecker as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const input = makeInput({ platform: 'twitter' });
    const result = await executor.execute(input);
    expect(result.metadata).toMatchObject({ matched: false });
    expect(result.data).toBeNull();
  });

  it('passes keywords to checker', async () => {
    const input = makeInput({
      excludeKeywords: ['spam'],
      keywords: ['help'],
      platform: 'twitter',
    });
    await executor.execute(input);
    expect(mockChecker).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeKeywords: ['spam'],
        keywords: ['help'],
      }),
    );
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'tiktok' },
      id: 't1',
      inputs: [],
      label: 'T',
      type: 'mentionTrigger',
    };
    expect(executor.validate(node).valid).toBe(false);
  });
});

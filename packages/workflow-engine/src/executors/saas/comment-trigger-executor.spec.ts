import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  type CommentChecker,
  CommentTriggerExecutor,
} from '@workflow-engine/executors/saas/comment-trigger-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(config: Record<string, unknown>): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'comment-trigger-1',
    inputs: [],
    label: 'Comment Trigger',
    type: 'commentTrigger',
  };
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs: new Map(), node };
}

describe('CommentTriggerExecutor', () => {
  let executor: CommentTriggerExecutor;
  let checker: CommentChecker;

  beforeEach(() => {
    executor = new CommentTriggerExecutor();
    checker = vi.fn().mockResolvedValue({
      commentId: 'comment-1',
      contentId: 'video-1',
      platform: 'youtube',
      postId: 'comment-1',
      text: 'nice',
      videoId: 'video-1',
    });
    executor.setChecker(checker);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('commentTrigger');
  });

  it('throws if checker is not configured', async () => {
    const fresh = new CommentTriggerExecutor();
    await expect(
      fresh.execute(makeInput({ platform: 'youtube' })),
    ).rejects.toThrow('Comment checker not configured');
  });

  it('checks for comments with configured filters', async () => {
    const result = await executor.execute(
      makeInput({
        brandId: 'brand-1',
        contentIds: ['video-1'],
        excludeKeywords: ['spam'],
        keywords: ['nice'],
        lastCommentId: 'comment-0',
        platform: 'youtube',
      }),
    );

    expect(checker).toHaveBeenCalledWith({
      brandId: 'brand-1',
      contentIds: ['video-1'],
      excludeKeywords: ['spam'],
      keywords: ['nice'],
      lastCommentId: 'comment-0',
      organizationId: 'org-1',
      platform: 'youtube',
    });
    expect(result.data).toMatchObject({
      commentId: 'comment-1',
      platform: 'youtube',
      text: 'nice',
    });
    expect(result.metadata).toMatchObject({
      commentId: 'comment-1',
      matched: true,
      platform: 'youtube',
    });
  });

  it('returns unmatched metadata when no comment is found', async () => {
    checker = vi.fn().mockResolvedValue(null);
    executor.setChecker(checker);

    const result = await executor.execute(makeInput({ platform: 'youtube' }));

    expect(result).toEqual({
      data: null,
      metadata: { matched: false, platform: 'youtube' },
    });
  });

  it('validates platform', () => {
    const result = executor.validate({
      config: { platform: 'invalid' },
      id: 'comment-trigger-1',
      inputs: [],
      label: 'Comment Trigger',
      type: 'commentTrigger',
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.includes('Invalid platform')),
    ).toBe(true);
  });
});

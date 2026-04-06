import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createPostReplyExecutor,
  type PostReplyExecutor,
  type ReplyPublisher,
} from '@workflow-engine/executors/saas/post-reply-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputData?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'reply-1',
    inputs: [],
    label: 'Post Reply',
    type: 'postReply',
  };
  const inputs = new Map<string, unknown>();
  if (inputData) {
    for (const [k, v] of Object.entries(inputData)) {
      inputs.set(k, v);
    }
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('PostReplyExecutor', () => {
  let executor: PostReplyExecutor;
  let mockPublisher: ReplyPublisher;

  beforeEach(() => {
    executor = createPostReplyExecutor();
    mockPublisher = vi.fn().mockResolvedValue({
      replyId: 'reply-123',
      replyUrl: 'https://x.com/user/status/reply-123',
    });
    executor.setPublisher(mockPublisher);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('postReply');
  });

  it('throws if publisher not configured', async () => {
    const fresh = createPostReplyExecutor();
    const input = makeInput({ platform: 'twitter', postId: '123', text: 'hi' });
    await expect(fresh.execute(input)).rejects.toThrow(
      'Reply publisher not configured',
    );
  });

  it('executes reply with config values', async () => {
    const input = makeInput({
      platform: 'twitter',
      postId: 'tweet-456',
      text: 'Great post!',
    });
    const result = await executor.execute(input);
    expect(mockPublisher).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        platform: 'twitter',
        postId: 'tweet-456',
        text: 'Great post!',
      }),
    );
    expect(result.data).toMatchObject({
      originalPostId: 'tweet-456',
      platform: 'twitter',
      replyId: 'reply-123',
      success: true,
    });
  });

  it('uses input values when config is missing', async () => {
    const input = makeInput(
      { platform: 'twitter' },
      {
        postId: 'tweet-789',
        text: 'From input!',
      },
    );
    const result = await executor.execute(input);
    expect(result.data).toMatchObject({ success: true });
  });

  it('throws if postId missing', async () => {
    const input = makeInput({ platform: 'twitter', text: 'hello' });
    await expect(executor.execute(input)).rejects.toThrow(
      'Post ID is required',
    );
  });

  it('throws if text missing', async () => {
    const input = makeInput({ platform: 'twitter', postId: '123' });
    await expect(executor.execute(input)).rejects.toThrow(
      'Reply text is required',
    );
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'invalid' },
      id: 'r1',
      inputs: [],
      label: 'Reply',
      type: 'postReply',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e: string) => e.includes('Invalid platform')),
    ).toBe(true);
  });

  it('validates valid platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'twitter' },
      id: 'r1',
      inputs: [],
      label: 'Reply',
      type: 'postReply',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(true);
  });
});

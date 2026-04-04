import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createTweetRemixExecutor } from '@workflow-engine/executors/saas/tweet-remix-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('TweetRemixExecutor', () => {
  describe('validate', () => {
    it('valid with no config', () => {
      expect(
        createTweetRemixExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'TR',
          type: 'tweetRemix',
        }).valid,
      ).toBe(true);
    });
    it('invalid tone', () => {
      expect(
        createTweetRemixExecutor().validate({
          config: { tone: 'angry' },
          id: '1',
          inputs: [],
          label: 'TR',
          type: 'tweetRemix',
        }).valid,
      ).toBe(false);
    });
    it('invalid maxLength', () => {
      expect(
        createTweetRemixExecutor().validate({
          config: { maxLength: 600 },
          id: '1',
          inputs: [],
          label: 'TR',
          type: 'tweetRemix',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 1', () => {
    expect(
      createTweetRemixExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'TR',
        type: 'tweetRemix',
      }),
    ).toBe(1);
  });

  describe('execute', () => {
    it('throws without remixer', async () => {
      await expect(
        createTweetRemixExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([['text', 'hi']]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'TR',
            type: 'tweetRemix',
          },
        }),
      ).rejects.toThrow('remixer');
    });

    it('remixes tweet', async () => {
      const remixer = vi.fn().mockResolvedValue({
        selectedText: 'Remix',
        variations: [{ charCount: 5, id: 'v1', text: 'Remix' }],
      });
      const exec = createTweetRemixExecutor(remixer);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([['text', 'hi']]),
        node: {
          config: { tone: 'witty' },
          id: '1',
          inputs: [],
          label: 'TR',
          type: 'tweetRemix',
        },
      });
      expect(result.data).toBe('Remix');
      expect(result.metadata?.tone).toBe('witty');
    });
  });
});

import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createTweetInputExecutor } from '@workflow-engine/executors/saas/tweet-input-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('TweetInputExecutor', () => {
  describe('validate', () => {
    it('valid url mode', () => {
      expect(
        createTweetInputExecutor().validate({
          config: { inputMode: 'url', tweetUrl: 'https://x.com/1' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        }).valid,
      ).toBe(true);
    });
    it('invalid url without tweetUrl', () => {
      expect(
        createTweetInputExecutor().validate({
          config: { inputMode: 'url' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        }).valid,
      ).toBe(false);
    });
    it('valid text mode', () => {
      expect(
        createTweetInputExecutor().validate({
          config: { inputMode: 'text', rawText: 'hi' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        }).valid,
      ).toBe(true);
    });
    it('invalid without mode', () => {
      expect(
        createTweetInputExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        }).valid,
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('returns raw text', async () => {
      const exec = createTweetInputExecutor();
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { inputMode: 'text', rawText: 'Hello!' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        },
      });
      expect(result.data).toBe('Hello!');
      expect(result.metadata?.inputMode).toBe('text');
    });

    it('fetches tweet', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValue({ authorHandle: '@u', text: 'Hi', tweetId: '1' });
      const exec = createTweetInputExecutor(fetcher);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { inputMode: 'url', tweetUrl: 'https://x.com/1' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'tweetInput',
        },
      });
      expect(result.data).toBe('Hi');
      expect(result.metadata?.authorHandle).toBe('@u');
    });

    it('throws without fetcher', async () => {
      await expect(
        createTweetInputExecutor().execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: { inputMode: 'url', tweetUrl: 'https://x.com/1' },
            id: '1',
            inputs: [],
            label: 'T',
            type: 'tweetInput',
          },
        }),
      ).rejects.toThrow('fetcher');
    });
  });
});

import type { ExecutionContext } from '@workflow-engine/execution/engine';
import {
  createTrendTriggerExecutor,
  type TrendTriggerOutput,
} from '@workflow-engine/executors/saas/trend-trigger-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('TrendTriggerExecutor', () => {
  describe('validate', () => {
    it('valid config', () => {
      expect(
        createTrendTriggerExecutor().validate({
          config: { platform: 'tiktok', trendType: 'video' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        }).valid,
      ).toBe(true);
    });
    it('invalid platform', () => {
      expect(
        createTrendTriggerExecutor().validate({
          config: { platform: 'snap', trendType: 'video' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        }).valid,
      ).toBe(false);
    });
    it('invalid trendType', () => {
      expect(
        createTrendTriggerExecutor().validate({
          config: { platform: 'tiktok', trendType: 'meme' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        }).valid,
      ).toBe(false);
    });
    it('invalid minViralScore', () => {
      expect(
        createTrendTriggerExecutor().validate({
          config: {
            minViralScore: 150,
            platform: 'tiktok',
            trendType: 'video',
          },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        }).valid,
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('throws without checker', async () => {
      await expect(
        createTrendTriggerExecutor().execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: { platform: 'tiktok', trendType: 'video' },
            id: '1',
            inputs: [],
            label: 'T',
            type: 'trendTrigger',
          },
        }),
      ).rejects.toThrow('checker');
    });

    it('returns trend data', async () => {
      const checker = vi.fn().mockResolvedValue({
        hashtags: ['#ai'],
        platform: 'tiktok',
        soundId: null,
        topic: 'AI',
        trendId: 't-1',
        videoUrl: null,
        viralScore: 90,
      });
      const exec = createTrendTriggerExecutor(checker);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { platform: 'tiktok', trendType: 'video' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        },
      });
      expect((result.data as TrendTriggerOutput).trendId).toBe('t-1');
    });

    it('passes keywords and platform from inputs when provided', async () => {
      const checker = vi.fn().mockResolvedValue(null);
      const exec = createTrendTriggerExecutor(checker);

      await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['keywords', ['ai tools']],
          ['platform', 'twitter'],
        ]),
        node: {
          config: { platform: 'tiktok', trendType: 'hashtag' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        },
      });

      expect(checker).toHaveBeenCalledWith(
        expect.objectContaining({
          keywords: ['ai tools'],
          platform: 'twitter',
        }),
      );
    });

    it('returns null when no trend', async () => {
      const checker = vi.fn().mockResolvedValue(null);
      const exec = createTrendTriggerExecutor(checker);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { platform: 'tiktok', trendType: 'video' },
          id: '1',
          inputs: [],
          label: 'T',
          type: 'trendTrigger',
        },
      });
      expect(result.data).toBeNull();
      expect(result.metadata?.noNewTrend).toBe(true);
    });
  });
});

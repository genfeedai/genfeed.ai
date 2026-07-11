import { MusicSourceType } from '@genfeedai/enums';
import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createMusicSourceExecutor } from '@workflow-engine/executors/saas/music-source-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('MusicSourceExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createMusicSourceExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }).valid,
      ).toBe(true);
    });
    it('invalid sourceType', () => {
      expect(
        createMusicSourceExecutor().validate({
          config: { sourceType: 'spotify' },
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }).valid,
      ).toBe(false);
    });
    it('invalid generateDuration', () => {
      expect(
        createMusicSourceExecutor().validate({
          config: { generateDuration: 500 },
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }).valid,
      ).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('5 for generate', () => {
      expect(
        createMusicSourceExecutor().estimateCost({
          config: { sourceType: MusicSourceType.GENERATE },
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }),
      ).toBe(5);
    });
    it('2 for trend', () => {
      expect(
        createMusicSourceExecutor().estimateCost({
          config: { sourceType: MusicSourceType.TREND_SOUND },
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }),
      ).toBe(2);
    });
    it('1 for library', () => {
      expect(
        createMusicSourceExecutor().estimateCost({
          config: { sourceType: MusicSourceType.LIBRARY },
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        }),
      ).toBe(1);
    });
  });

  describe('execute', () => {
    it('throws without resolver', async () => {
      await expect(
        createMusicSourceExecutor().execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'M',
            type: 'musicSource',
          },
        }),
      ).rejects.toThrow('resolver');
    });

    it('resolves music', async () => {
      const resolver = vi.fn().mockResolvedValue({
        artist: 'A',
        duration: 60,
        musicUrl: 'http://m.mp3',
        tempo: 120,
        title: 'Song',
      });
      const exec = createMusicSourceExecutor(resolver);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'M',
          type: 'musicSource',
        },
      });
      expect(result.data).toBe('http://m.mp3');
      expect(result.metadata?.title).toBe('Song');
    });
  });
});

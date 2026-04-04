import { BeatSensitivity } from '@genfeedai/enums';
import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createBeatAnalysisExecutor } from '@workflow-engine/executors/saas/beat-analysis-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('BeatAnalysisExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createBeatAnalysisExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        }).valid,
      ).toBe(true);
    });
    it('invalid minBpm < 20', () => {
      expect(
        createBeatAnalysisExecutor().validate({
          config: { minBpm: 10 },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        }).valid,
      ).toBe(false);
    });
    it('invalid maxBpm > 300', () => {
      expect(
        createBeatAnalysisExecutor().validate({
          config: { maxBpm: 400 },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        }).valid,
      ).toBe(false);
    });
    it('invalid minBpm > maxBpm', () => {
      expect(
        createBeatAnalysisExecutor().validate({
          config: { maxBpm: 100, minBpm: 200 },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        }).valid,
      ).toBe(false);
    });
    it('invalid beatSensitivity', () => {
      expect(
        createBeatAnalysisExecutor().validate({
          config: { beatSensitivity: 'ultra' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 2', () => {
    expect(
      createBeatAnalysisExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'BA',
        type: 'beatAnalysis',
      }),
    ).toBe(2);
  });

  describe('execute', () => {
    it('throws without analyzer', async () => {
      await expect(
        createBeatAnalysisExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([['musicUrl', 'http://m.mp3']]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'BA',
            type: 'beatAnalysis',
          },
        }),
      ).rejects.toThrow('analyzer');
    });

    it('analyzes beats', async () => {
      const analyzer = vi.fn().mockResolvedValue({
        analysisMethod: 'aubio',
        beatCount: 3,
        beatTimestamps: [0.5, 1.0],
        confidence: 0.95,
        downbeats: [0.5],
        tempo: 120,
      });
      const exec = createBeatAnalysisExecutor(analyzer);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([['musicUrl', 'http://m.mp3']]),
        node: {
          config: { beatSensitivity: BeatSensitivity.HIGH },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'beatAnalysis',
        },
      });
      expect((result.data as any).tempo).toBe(120);
      expect(result.metadata?.analysisMethod).toBe('aubio');
    });
  });
});

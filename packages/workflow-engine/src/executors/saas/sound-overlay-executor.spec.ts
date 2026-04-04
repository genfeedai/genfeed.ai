import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createSoundOverlayExecutor } from '@workflow-engine/executors/saas/sound-overlay-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('SoundOverlayExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createSoundOverlayExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'SO',
          type: 'soundOverlay',
        }).valid,
      ).toBe(true);
    });
    it('invalid mixMode', () => {
      expect(
        createSoundOverlayExecutor().validate({
          config: { mixMode: 'surround' },
          id: '1',
          inputs: [],
          label: 'SO',
          type: 'soundOverlay',
        }).valid,
      ).toBe(false);
    });
    it('invalid audioVolume', () => {
      expect(
        createSoundOverlayExecutor().validate({
          config: { audioVolume: 300 },
          id: '1',
          inputs: [],
          label: 'SO',
          type: 'soundOverlay',
        }).valid,
      ).toBe(false);
    });
    it('invalid videoVolume', () => {
      expect(
        createSoundOverlayExecutor().validate({
          config: { videoVolume: -1 },
          id: '1',
          inputs: [],
          label: 'SO',
          type: 'soundOverlay',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 2', () => {
    expect(
      createSoundOverlayExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'SO',
        type: 'soundOverlay',
      }),
    ).toBe(2);
  });

  describe('execute', () => {
    it('throws without processor', async () => {
      await expect(
        createSoundOverlayExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['videoUrl', 'v'],
            ['soundUrl', 's'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'SO',
            type: 'soundOverlay',
          },
        }),
      ).rejects.toThrow('processor');
    });

    it('overlays sound', async () => {
      const processor = vi
        .fn()
        .mockResolvedValue({ jobId: 'j', outputVideoUrl: 'http://out.mp4' });
      const exec = createSoundOverlayExecutor(processor);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['videoUrl', 'v'],
          ['soundUrl', 's'],
        ]),
        node: {
          config: { mixMode: 'mix' },
          id: '1',
          inputs: [],
          label: 'SO',
          type: 'soundOverlay',
        },
      });
      expect(result.data).toBe('http://out.mp4');
      expect(result.metadata?.mixMode).toBe('mix');
    });
  });
});

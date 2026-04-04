import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createVideoInputExecutor } from '@workflow-engine/executors/saas/video-input-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('VideoInputExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createVideoInputExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'V',
          type: 'videoInput',
        }).valid,
      ).toBe(true);
    });
    it('invalid maxVideos', () => {
      expect(
        createVideoInputExecutor().validate({
          config: { maxVideos: 100 },
          id: '1',
          inputs: [],
          label: 'V',
          type: 'videoInput',
        }).valid,
      ).toBe(false);
    });
    it('invalid minClipDuration', () => {
      expect(
        createVideoInputExecutor().validate({
          config: { minClipDuration: 100 },
          id: '1',
          inputs: [],
          label: 'V',
          type: 'videoInput',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 1', () => {
    expect(
      createVideoInputExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'V',
        type: 'videoInput',
      }),
    ).toBe(1);
  });

  describe('execute', () => {
    it('throws without validator', async () => {
      await expect(
        createVideoInputExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([['videoUrls', ['v.mp4']]]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'V',
            type: 'videoInput',
          },
        }),
      ).rejects.toThrow('validator');
    });

    it('processes array of URLs', async () => {
      const validator = vi.fn().mockResolvedValue({
        totalDuration: 60,
        videoCount: 2,
        videoFiles: ['v1', 'v2'],
      });
      const exec = createVideoInputExecutor(validator);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([['videoUrls', ['v1.mp4', 'v2.mp4']]]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'V',
          type: 'videoInput',
        },
      });
      expect(result.data).toEqual(['v1', 'v2']);
      expect(result.metadata?.videoCount).toBe(2);
    });

    it('wraps single string', async () => {
      const validator = vi.fn().mockResolvedValue({
        totalDuration: 30,
        videoCount: 1,
        videoFiles: ['v1'],
      });
      const exec = createVideoInputExecutor(validator);
      await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([['videoUrls', 'v1.mp4']]),
        node: {
          config: {},
          id: '1',
          inputs: [],
          label: 'V',
          type: 'videoInput',
        },
      });
      expect(validator).toHaveBeenCalledWith(
        expect.objectContaining({ videoUrls: ['v1.mp4'] }),
      );
    });

    it('throws on missing videoUrls', async () => {
      const validator = vi.fn();
      const exec = createVideoInputExecutor(validator);
      await expect(
        exec.execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'V',
            type: 'videoInput',
          },
        }),
      ).rejects.toThrow('videoUrls');
    });

    it('throws on empty array', async () => {
      const validator = vi.fn();
      const exec = createVideoInputExecutor(validator);
      await expect(
        exec.execute({
          context: ctx,
          inputs: new Map<string, unknown>([['videoUrls', []]]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'V',
            type: 'videoInput',
          },
        }),
      ).rejects.toThrow('At least one');
    });
  });
});

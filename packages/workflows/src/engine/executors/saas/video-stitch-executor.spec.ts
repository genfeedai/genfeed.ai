import { VideoTransition } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import {
  collectVideoStitchUrls,
  createVideoStitchExecutor,
  VIDEO_STITCH_TRANSITION_MAP,
} from './video-stitch-executor';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
  workflowVersionId: 'w-v1',
};

describe('collectVideoStitchUrls', () => {
  it('preserves numbered video-N handle order', () => {
    const inputs = new Map<string, unknown>([
      ['video-2', 'https://cdn.example/two.mp4'],
      ['video-1', { video: 'https://cdn.example/one.mp4' }],
      ['video-3', { videoUrl: 'https://cdn.example/three.mp4' }],
    ]);

    expect(collectVideoStitchUrls(inputs, {})).toEqual([
      'https://cdn.example/one.mp4',
      'https://cdn.example/two.mp4',
      'https://cdn.example/three.mp4',
    ]);
  });

  it('reads a videos array handle', () => {
    const inputs = new Map<string, unknown>([
      ['videos', ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4']],
    ]);

    expect(collectVideoStitchUrls(inputs, {})).toEqual([
      'https://cdn.example/a.mp4',
      'https://cdn.example/b.mp4',
    ]);
  });
});

describe('VideoStitchExecutor', () => {
  describe('validate', () => {
    it('valid defaults', () => {
      expect(
        createVideoStitchExecutor().validate({
          config: {},
          id: '1',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        }).valid,
      ).toBe(true);
    });

    it('invalid transitionType', () => {
      expect(
        createVideoStitchExecutor().validate({
          config: { transitionType: 'morph' },
          id: '1',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        }).valid,
      ).toBe(false);
    });

    it('invalid transitionDuration', () => {
      expect(
        createVideoStitchExecutor().validate({
          config: { transitionDuration: -1 },
          id: '1',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        }).valid,
      ).toBe(false);
    });
  });

  it('estimateCost returns 1', () => {
    expect(
      createVideoStitchExecutor().estimateCost({
        config: {},
        id: '1',
        inputs: [],
        label: 'Stitch',
        type: 'videoStitch',
      }),
    ).toBe(1);
  });

  describe('execute', () => {
    it('throws without processor', async () => {
      await expect(
        createVideoStitchExecutor().execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['video-1', 'https://cdn.example/a.mp4'],
            ['video-2', 'https://cdn.example/b.mp4'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'Stitch',
            type: 'videoStitch',
          },
        }),
      ).rejects.toThrow('processor');
    });

    it('throws with fewer than 2 videos', async () => {
      const processor = vi.fn();
      await expect(
        createVideoStitchExecutor(processor).execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            ['video-1', 'https://cdn.example/a.mp4'],
          ]),
          node: {
            config: {},
            id: '1',
            inputs: [],
            label: 'Stitch',
            type: 'videoStitch',
          },
        }),
      ).rejects.toThrow('at least 2');
      expect(processor).not.toHaveBeenCalled();
    });

    it('delegates the ordered clips to the stitch processor', async () => {
      const processor = vi.fn().mockResolvedValue({
        jobId: 'stitch-output',
        outputId: 'output',
        outputVideoUrl: 'https://cdn.example/stitched.mp4',
      });
      const exec = createVideoStitchExecutor(processor);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          ['video-1', 'https://cdn.example/a.mp4'],
          ['video-2', 'https://cdn.example/b.mp4'],
          ['video-3', 'https://cdn.example/c.mp4'],
        ]),
        node: {
          config: { transitionType: 'cut' },
          id: 'stitch-node',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        },
      });

      expect(result.data).toEqual({
        ingredientId: 'output',
        video: 'https://cdn.example/stitched.mp4',
        videoUrl: 'https://cdn.example/stitched.mp4',
      });
      expect(result.metadata).toEqual({
        jobId: 'stitch-output',
        transition: VideoTransition.NONE,
        transitionType: 'cut',
        videoCount: 3,
      });
      expect(processor).toHaveBeenCalledWith({
        brandId: undefined,
        executionId: undefined,
        nodeId: 'stitch-node',
        organizationId: 'o',
        parentId: undefined,
        providerData: undefined,
        runId: 'r',
        transition: VideoTransition.NONE,
        userId: 'u',
        videoUrls: [
          'https://cdn.example/a.mp4',
          'https://cdn.example/b.mp4',
          'https://cdn.example/c.mp4',
        ],
      });
    });

    it.each([
      ['cut', VideoTransition.NONE],
      ['crossfade', VideoTransition.FADE],
      ['wipe', VideoTransition.WIPELEFT],
      ['fade', VideoTransition.FADE],
    ] as const)(
      'maps the %s node transition to a worker transition',
      async (transitionType, transition) => {
        expect(VIDEO_STITCH_TRANSITION_MAP[transitionType]).toBe(transition);
        const processor = vi.fn().mockResolvedValue({
          jobId: 'j',
          outputVideoUrl: 'https://cdn.example/stitched.mp4',
        });
        await createVideoStitchExecutor(processor).execute({
          context: ctx,
          inputs: new Map<string, unknown>([
            [
              'videos',
              ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4'],
            ],
          ]),
          node: {
            config: { transitionDuration: 0.5, transitionType },
            id: 'n',
            inputs: [],
            label: 'Stitch',
            type: 'videoStitch',
          },
        });
        const params = processor.mock.calls[0]?.[0];
        expect(params.transition).toBe(transition);
        if (transition === VideoTransition.NONE) {
          expect(params).not.toHaveProperty('transitionDuration');
        } else {
          expect(params.transitionDuration).toBe(0.5);
        }
      },
    );

    it('omits a zero transition duration so the worker default applies', async () => {
      const processor = vi.fn().mockResolvedValue({
        jobId: 'j',
        outputVideoUrl: 'https://cdn.example/stitched.mp4',
      });
      await createVideoStitchExecutor(processor).execute({
        context: ctx,
        inputs: new Map<string, unknown>([
          [
            'videos',
            ['https://cdn.example/a.mp4', 'https://cdn.example/b.mp4'],
          ],
        ]),
        node: {
          config: { transitionDuration: 0, transitionType: 'crossfade' },
          id: 'n',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        },
      });
      expect(processor.mock.calls[0]?.[0]).not.toHaveProperty(
        'transitionDuration',
      );
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import {
  buildFfmpegConcatDemuxerList,
  buildFfmpegConcatFilter,
  collectVideoStitchUrls,
  createVideoStitchExecutor,
} from './video-stitch-executor';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('buildFfmpegConcatFilter', () => {
  it('uses the concat filter for cut transitions', () => {
    expect(
      buildFfmpegConcatFilter({
        hasAudio: true,
        transitionDuration: 0,
        transitionType: 'cut',
        videoCount: 3,
      }),
    ).toBe('concat=n=3:v=1:a=1');
  });

  it('drops the audio stream when hasAudio is false', () => {
    expect(
      buildFfmpegConcatFilter({
        hasAudio: false,
        transitionDuration: 0,
        transitionType: 'cut',
        videoCount: 2,
      }),
    ).toBe('concat=n=2:v=1:a=0');
  });

  it('uses xfade for crossfade transitions', () => {
    const filter = buildFfmpegConcatFilter({
      hasAudio: true,
      transitionDuration: 0.5,
      transitionType: 'crossfade',
      videoCount: 2,
    });
    expect(filter).toContain('xfade=transition=fade:duration=0.5');
  });
});

describe('buildFfmpegConcatDemuxerList', () => {
  it('emits one file entry per video for the concat demuxer', () => {
    expect(
      buildFfmpegConcatDemuxerList([
        'https://cdn.example/a.mp4',
        'https://cdn.example/b.mp4',
      ]),
    ).toBe(
      "file 'https://cdn.example/a.mp4'\nfile 'https://cdn.example/b.mp4'",
    );
  });
});

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

    it('concatenates videos via mocked FFmpeg processor', async () => {
      const processor = vi.fn().mockResolvedValue({
        jobId: 'j-stitch',
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
          id: '1',
          inputs: [],
          label: 'Stitch',
          type: 'videoStitch',
        },
      });

      expect(result.data).toMatchObject({
        video: 'https://cdn.example/stitched.mp4',
        videoUrl: 'https://cdn.example/stitched.mp4',
      });
      expect(result.metadata?.jobId).toBe('j-stitch');
      expect(result.metadata?.concatFilter).toBe('concat=n=3:v=1:a=1');
      expect(processor).toHaveBeenCalledWith(
        expect.objectContaining({
          concatFilter: 'concat=n=3:v=1:a=1',
          organizationId: 'o',
          transitionType: 'cut',
          videoUrls: [
            'https://cdn.example/a.mp4',
            'https://cdn.example/b.mp4',
            'https://cdn.example/c.mp4',
          ],
        }),
      );
    });
  });
});

import type { WorkflowNode } from '@genfeedai/types';
import { describe, expect, it } from 'vitest';
import { getOutputUpdate } from './outputHelpers';

function workflowStoreFor(node?: Partial<WorkflowNode>) {
  return {
    getNodeById: () =>
      node
        ? ({
            data: {},
            id: 'node-1',
            position: { x: 0, y: 0 },
            type: 'prompt',
            ...node,
          } as WorkflowNode)
        : undefined,
  };
}

describe('getOutputUpdate', () => {
  it('returns an empty update when the node is missing', () => {
    expect(
      getOutputUpdate(
        'missing',
        'https://asset.test/x.png',
        workflowStoreFor(),
      ),
    ).toEqual({});
  });

  it('maps image generation outputs to first image and all image URLs', () => {
    expect(
      getOutputUpdate(
        'node-1',
        { images: ['https://asset.test/1.png', 'https://asset.test/2.png'] },
        workflowStoreFor({ type: 'imageGen' }),
      ),
    ).toEqual({
      outputImage: 'https://asset.test/1.png',
      outputImages: ['https://asset.test/1.png', 'https://asset.test/2.png'],
    });

    expect(
      getOutputUpdate(
        'node-1',
        { image: 'https://asset.test/single.png' },
        workflowStoreFor({ type: 'imageGen' }),
      ),
    ).toEqual({
      outputImage: 'https://asset.test/single.png',
      outputImages: ['https://asset.test/single.png'],
    });
  });

  it('routes unified node outputs by input type', () => {
    expect(
      getOutputUpdate(
        'node-1',
        ['https://asset.test/upscaled.mp4'],
        workflowStoreFor({
          data: { inputType: 'video' },
          type: 'upscale',
        }),
      ),
    ).toEqual({ outputVideo: 'https://asset.test/upscaled.mp4' });

    expect(
      getOutputUpdate(
        'node-1',
        { url: 'https://asset.test/reframed.png' },
        workflowStoreFor({
          data: { inputType: 'image' },
          type: 'reframe',
        }),
      ),
    ).toEqual({ outputImage: 'https://asset.test/reframed.png' });
  });

  it.each([
    ['videoGen'],
    ['animation'],
    ['videoStitch'],
    ['lipSync'],
    ['voiceChange'],
    ['motionControl'],
  ])('maps %s outputs to outputVideo', (type) => {
    expect(
      getOutputUpdate(
        'node-1',
        { video: 'https://asset.test/video.mp4' },
        workflowStoreFor({ type }),
      ),
    ).toEqual({ outputVideo: 'https://asset.test/video.mp4' });
  });

  it('maps audio, text, resize, and fallback outputs', () => {
    expect(
      getOutputUpdate(
        'node-1',
        { audio: 'https://asset.test/audio.mp3' },
        workflowStoreFor({ type: 'textToSpeech' }),
      ),
    ).toEqual({ outputAudio: 'https://asset.test/audio.mp3' });

    expect(
      getOutputUpdate(
        'node-1',
        ['hello ', 'world'],
        workflowStoreFor({ type: 'llm' }),
      ),
    ).toEqual({ outputText: 'hello world' });

    expect(
      getOutputUpdate(
        'node-1',
        { url: 'https://asset.test/resized.png' },
        workflowStoreFor({ type: 'resize' }),
      ),
    ).toEqual({ outputMedia: 'https://asset.test/resized.png' });

    expect(
      getOutputUpdate(
        'node-1',
        [{ url: 'https://asset.test/fallback.png' }],
        workflowStoreFor({ type: 'unknown' }),
      ),
    ).toEqual({ output: 'https://asset.test/fallback.png' });
  });
});

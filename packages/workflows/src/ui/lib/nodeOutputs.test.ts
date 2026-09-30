import type { WorkflowNode } from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';

import { getNodeOutputForHandle } from './nodeOutputs';

function createNode(data: Record<string, unknown>): WorkflowNode {
  return {
    data,
    id: 'node-1',
    position: { x: 0, y: 0 },
    type: 'prompt',
  } as WorkflowNode;
}

describe('getNodeOutputForHandle', () => {
  it('prefers text output over prompt fallback', () => {
    const value = getNodeOutputForHandle(
      createNode({ outputText: 'generated', prompt: 'fallback' }),
      'text',
    );

    expect(value).toBe('generated');
  });

  it('uses the prompt fallback and returns undefined when text is unavailable', () => {
    expect(
      getNodeOutputForHandle(createNode({ prompt: 'fallback' }), 'text'),
    ).toBe('fallback');
    expect(getNodeOutputForHandle(createNode({}), 'text')).toBeUndefined();
  });

  it('falls back to source media fields when output fields are missing', () => {
    expect(
      getNodeOutputForHandle(createNode({ image: 'image.png' }), 'image'),
    ).toBe('image.png');
    expect(
      getNodeOutputForHandle(createNode({ video: 'video.mp4' }), 'video'),
    ).toBe('video.mp4');
    expect(
      getNodeOutputForHandle(createNode({ audio: 'audio.mp3' }), 'audio'),
    ).toBe('audio.mp3');
  });

  it('prefers direct generated media outputs', () => {
    expect(
      getNodeOutputForHandle(
        createNode({ outputImage: 'generated.png' }),
        'image',
      ),
    ).toBe('generated.png');
    expect(
      getNodeOutputForHandle(
        createNode({ outputVideo: 'generated.mp4' }),
        'video',
      ),
    ).toBe('generated.mp4');
    expect(
      getNodeOutputForHandle(
        createNode({ outputAudio: 'generated.mp3' }),
        'audio',
      ),
    ).toBe('generated.mp3');
  });

  it('returns undefined when media outputs are unavailable', () => {
    expect(getNodeOutputForHandle(createNode({}), 'image')).toBeUndefined();
    expect(getNodeOutputForHandle(createNode({}), 'video')).toBeUndefined();
    expect(getNodeOutputForHandle(createNode({}), 'audio')).toBeUndefined();
  });

  it('returns undefined for unsupported handle types', () => {
    const value = getNodeOutputForHandle(
      createNode({ outputText: 'x' }),
      'zip',
    );

    expect(value).toBeUndefined();
  });
});

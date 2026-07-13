import type { WorkflowNode } from '@genfeedai/types';
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

  it('returns undefined for unsupported handle types', () => {
    const value = getNodeOutputForHandle(
      createNode({ outputText: 'x' }),
      'zip',
    );

    expect(value).toBeUndefined();
  });
});

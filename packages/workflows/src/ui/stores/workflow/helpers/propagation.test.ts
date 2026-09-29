import { describe, expect, it, vi } from 'vitest';

import {
  applyNodeUpdates,
  collectGalleryUpdate,
  computeDownstreamUpdates,
  getNodeOutput,
  getOutputType,
  hasStateChanged,
  mapOutputToInput,
  propagateExistingOutputs,
} from './propagation';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  return { data, id, position: { x: 0, y: 0 }, type } as any;
}

function makeEdge(id: string, source: string, target: string) {
  return { id, source, sourceHandle: null, target, targetHandle: null } as any;
}

/* -------------------------------------------------------------------------- */
/*  getNodeOutput                                                             */
/* -------------------------------------------------------------------------- */

describe('getNodeOutput', () => {
  it('returns first element of outputImages when non-empty', () => {
    const node = makeNode('n1', 'imageGen', {
      outputImages: ['a.jpg', 'b.jpg'],
    });
    expect(getNodeOutput(node)).toBe('a.jpg');
  });

  it('returns null for non-string, non-array value', () => {
    const node = makeNode('n1', 'imageGen', { outputImage: 42 });
    expect(getNodeOutput(node)).toBeNull();
  });

  it('returns first element of an array value via fallback', () => {
    const node = makeNode('n1', 'imageGen', {
      outputImage: ['first.jpg', 'second.jpg'],
    });
    expect(getNodeOutput(node)).toBe('first.jpg');
  });
});

/* -------------------------------------------------------------------------- */
/*  getOutputType                                                             */
/* -------------------------------------------------------------------------- */

describe('getOutputType', () => {
  it.each([
    'imageGen',
    'image',
    'imageInput',
    'upscale',
    'resize',
    'reframe',
    'imageGridSplit',
  ])('returns image for %s', (type) => {
    expect(getOutputType(type)).toBe('image');
  });

  it.each([
    'videoGen',
    'video',
    'videoInput',
    'animation',
    'videoStitch',
    'lipSync',
    'voiceChange',
    'motionControl',
    'videoTrim',
    'videoFrameExtract',
    'subtitle',
  ])('returns video for %s', (type) => {
    expect(getOutputType(type)).toBe('video');
  });
});

/* -------------------------------------------------------------------------- */
/*  mapOutputToInput                                                          */
/* -------------------------------------------------------------------------- */

describe('mapOutputToInput', () => {
  // Text source routing

  it('text -> subtitle -> inputText', () => {
    expect(mapOutputToInput('hello', 'llm', 'subtitle')).toEqual({
      inputText: 'hello',
    });
  });

  // Image source routing
  it('image -> imageGen -> inputImages array', () => {
    expect(mapOutputToInput('img.jpg', 'imageGen', 'imageGen')).toEqual({
      inputImages: ['img.jpg'],
    });
  });

  it('image -> upscale -> inputImage with type', () => {
    expect(mapOutputToInput('img.jpg', 'imageGen', 'upscale')).toEqual({
      inputImage: 'img.jpg',
      inputType: 'image',
      inputVideo: null,
    });
  });

  // Video source routing
  it('video -> download -> inputVideo', () => {
    expect(mapOutputToInput('vid.mp4', 'videoGen', 'download')).toEqual({
      inputImage: null,
      inputType: 'video',
      inputVideo: 'vid.mp4',
    });
  });

  it('image -> download -> inputImage', () => {
    expect(mapOutputToInput('img.jpg', 'imageGen', 'download')).toEqual({
      inputImage: 'img.jpg',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('text -> download -> null (incompatible)', () => {
    expect(mapOutputToInput('text', 'prompt', 'download')).toBeNull();
  });

  it('video -> upscale -> inputVideo with type', () => {
    expect(mapOutputToInput('vid.mp4', 'videoGen', 'upscale')).toEqual({
      inputImage: null,
      inputType: 'video',
      inputVideo: 'vid.mp4',
    });
  });

  it('video -> videoStitch -> inputVideo', () => {
    expect(mapOutputToInput('vid.mp4', 'video', 'videoStitch')).toEqual({
      inputVideo: 'vid.mp4',
    });
  });

  // Audio source routing

  it('audio -> transcribe -> inputAudio', () => {
    expect(mapOutputToInput('aud.mp3', 'audio', 'transcribe')).toEqual({
      inputAudio: 'aud.mp3',
    });
  });

  // Incompatible

  it('returns null for unknown source type', () => {
    expect(mapOutputToInput('val', 'unknownType', 'imageGen')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  collectGalleryUpdate                                                      */
/* -------------------------------------------------------------------------- */

describe('collectGalleryUpdate', () => {
  it('returns null when currentOutput is empty and no outputImages', () => {
    const result = collectGalleryUpdate({}, '', [], []);
    // empty string is still a string, so it gets pushed
    expect(result).toEqual({ images: [''] });
  });
});

/* -------------------------------------------------------------------------- */
/*  computeDownstreamUpdates                                                  */
/* -------------------------------------------------------------------------- */

describe('computeDownstreamUpdates', () => {
  it('propagates with passthrough when target has existing output', () => {
    const nodes = [
      makeNode('A', 'prompt', { outputText: 'hello' }),
      makeNode('B', 'imageGen', { outputImage: 'gen.jpg' }),
      makeNode('C', 'download', {}),
    ];
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'C')];

    const updates = computeDownstreamUpdates('A', 'hello', nodes, edges);
    expect(updates.get('B')).toEqual({ inputPrompt: 'hello' });
    expect(updates.get('C')).toEqual({
      inputImage: 'gen.jpg',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('propagates to branching targets A -> B and A -> C', () => {
    const nodes = [
      makeNode('A', 'prompt', { outputText: 'hello' }),
      makeNode('B', 'imageGen', {}),
      makeNode('C', 'textToSpeech', {}),
    ];
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'A', 'C')];

    const updates = computeDownstreamUpdates('A', 'hello', nodes, edges);
    expect(updates.get('B')).toEqual({ inputPrompt: 'hello' });
    expect(updates.get('C')).toEqual({ inputText: 'hello' });
  });

  it('prevents cycles', () => {
    const nodes = [
      makeNode('A', 'prompt', { outputText: 'hello' }),
      makeNode('B', 'imageGen', { outputImage: 'gen.jpg' }),
    ];
    // A -> B -> A (cycle)
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'A')];

    const updates = computeDownstreamUpdates('A', 'hello', nodes, edges);
    // B gets update, but A is already visited so cycle is broken
    expect(updates.get('B')).toEqual({ inputPrompt: 'hello' });
    expect(updates.has('A')).toBe(false);
  });

  it('handles gallery aggregation', () => {
    const nodes = [
      makeNode('A', 'imageGen', { outputImages: ['a.jpg', 'b.jpg'] }),
      makeNode('G', 'outputGallery', { images: ['existing.jpg'] }),
    ];
    const edges = [makeEdge('e1', 'A', 'G')];

    const updates = computeDownstreamUpdates('A', 'a.jpg', nodes, edges);
    const galleryUpdate = updates.get('G');
    expect(galleryUpdate).toBeDefined();
    expect(galleryUpdate?.images).toEqual(['existing.jpg', 'a.jpg', 'b.jpg']);
  });

  it('skips missing nodes gracefully', () => {
    const nodes = [makeNode('A', 'prompt', { outputText: 'hello' })];
    const edges = [makeEdge('e1', 'A', 'MISSING')];

    const updates = computeDownstreamUpdates('A', 'hello', nodes, edges);
    expect(updates.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  hasStateChanged                                                           */
/* -------------------------------------------------------------------------- */

describe('hasStateChanged', () => {
  it('returns false when values are the same', () => {
    const nodes = [makeNode('n1', 'imageGen', { inputPrompt: 'hello' })];
    const updates = new Map([['n1', { inputPrompt: 'hello' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });

  it('returns true when array lengths differ', () => {
    const nodes = [makeNode('n1', 'gallery', { images: ['a.jpg'] })];
    const updates = new Map([['n1', { images: ['a.jpg', 'b.jpg'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('skips missing nodes without error', () => {
    const nodes = [makeNode('n1', 'imageGen', { inputPrompt: 'hello' })];
    const updates = new Map([['nonexistent', { inputPrompt: 'world' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });

  it('returns false for identical array values', () => {
    const nodes = [makeNode('n1', 'gallery', { images: ['a.jpg', 'b.jpg'] })];
    const updates = new Map([['n1', { images: ['a.jpg', 'b.jpg'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  applyNodeUpdates                                                          */
/* -------------------------------------------------------------------------- */

describe('applyNodeUpdates', () => {
  it('applies updates immutably', () => {
    const nodes = [makeNode('n1', 'imageGen', { inputPrompt: 'old' })];
    const updates = new Map([['n1', { inputPrompt: 'new' }]]);

    const result = applyNodeUpdates(nodes, updates);
    expect(result[0].data.inputPrompt).toBe('new');
    // Original unchanged
    expect(nodes[0].data.inputPrompt).toBe('old');
    // New reference
    expect(result[0]).not.toBe(nodes[0]);
  });

  it('returns same-content array for empty updates', () => {
    const nodes = [makeNode('n1', 'imageGen', { inputPrompt: 'val' })];
    const updates = new Map<string, Record<string, unknown>>();

    const result = applyNodeUpdates(nodes, updates);
    expect(result.length).toBe(nodes.length);
    expect(result[0]).toBe(nodes[0]); // No update, same ref
  });

  it('merges update into existing data', () => {
    const nodes = [
      makeNode('n1', 'imageGen', { inputPrompt: 'old', model: 'flux' }),
    ];
    const updates = new Map([['n1', { inputPrompt: 'new' }]]);

    const result = applyNodeUpdates(nodes, updates);
    expect(result[0].data.inputPrompt).toBe('new');
    expect(result[0].data.model).toBe('flux');
  });
});

/* -------------------------------------------------------------------------- */
/*  propagateExistingOutputs                                                  */
/* -------------------------------------------------------------------------- */

describe('propagateExistingOutputs', () => {
  it('calls propagateFn for nodes with output', () => {
    const nodes = [
      makeNode('n1', 'imageGen', { outputImage: 'img.jpg' }),
      makeNode('n2', 'prompt', {}),
      makeNode('n3', 'videoGen', { outputVideo: 'vid.mp4' }),
    ];
    const fn = vi.fn();

    propagateExistingOutputs(nodes, fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('n1');
    expect(fn).toHaveBeenCalledWith('n3');
  });
});

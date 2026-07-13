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

  it('falls through empty outputImages to outputImage', () => {
    const node = makeNode('n1', 'imageGen', {
      outputImage: 'fallback.jpg',
      outputImages: [],
    });
    expect(getNodeOutput(node)).toBe('fallback.jpg');
  });

  it('returns outputImage when outputImages is absent', () => {
    const node = makeNode('n1', 'imageGen', { outputImage: 'img.jpg' });
    expect(getNodeOutput(node)).toBe('img.jpg');
  });

  it('returns outputVideo', () => {
    const node = makeNode('n1', 'videoGen', { outputVideo: 'vid.mp4' });
    expect(getNodeOutput(node)).toBe('vid.mp4');
  });

  it('returns outputText', () => {
    const node = makeNode('n1', 'llm', { outputText: 'hello world' });
    expect(getNodeOutput(node)).toBe('hello world');
  });

  it('returns outputAudio', () => {
    const node = makeNode('n1', 'tts', { outputAudio: 'audio.mp3' });
    expect(getNodeOutput(node)).toBe('audio.mp3');
  });

  it('returns prompt', () => {
    const node = makeNode('n1', 'prompt', { prompt: 'a sunset' });
    expect(getNodeOutput(node)).toBe('a sunset');
  });

  it('returns extractedTweet', () => {
    const node = makeNode('n1', 'tweetParser', {
      extractedTweet: 'tweet text',
    });
    expect(getNodeOutput(node)).toBe('tweet text');
  });

  it('returns image', () => {
    const node = makeNode('n1', 'image', { image: 'img2.jpg' });
    expect(getNodeOutput(node)).toBe('img2.jpg');
  });

  it('returns video', () => {
    const node = makeNode('n1', 'video', { video: 'vid2.mp4' });
    expect(getNodeOutput(node)).toBe('vid2.mp4');
  });

  it('returns audio', () => {
    const node = makeNode('n1', 'audio', { audio: 'aud.mp3' });
    expect(getNodeOutput(node)).toBe('aud.mp3');
  });

  it('respects priority: outputImage > outputVideo', () => {
    const node = makeNode('n1', 'imageGen', {
      outputImage: 'img.jpg',
      outputVideo: 'vid.mp4',
    });
    expect(getNodeOutput(node)).toBe('img.jpg');
  });

  it('returns null for empty data', () => {
    const node = makeNode('n1', 'imageGen', {});
    expect(getNodeOutput(node)).toBeNull();
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

  it('returns null for empty array value via fallback', () => {
    const node = makeNode('n1', 'imageGen', { outputImage: [] });
    expect(getNodeOutput(node)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  getOutputType                                                             */
/* -------------------------------------------------------------------------- */

describe('getOutputType', () => {
  it.each([
    'prompt',
    'llm',
    'tweetParser',
    'transcribe',
  ])('returns text for %s', (type) => {
    expect(getOutputType(type)).toBe('text');
  });

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

  it.each([
    'textToSpeech',
    'audio',
    'audioInput',
  ])('returns audio for %s', (type) => {
    expect(getOutputType(type)).toBe('audio');
  });

  it('returns null for unknown type', () => {
    expect(getOutputType('unknownWidget')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  mapOutputToInput                                                          */
/* -------------------------------------------------------------------------- */

describe('mapOutputToInput', () => {
  // Text source routing
  it('text -> imageGen -> inputPrompt', () => {
    expect(mapOutputToInput('hello', 'prompt', 'imageGen')).toEqual({
      inputPrompt: 'hello',
    });
  });

  it('text -> textToSpeech -> inputText', () => {
    expect(mapOutputToInput('hello', 'llm', 'textToSpeech')).toEqual({
      inputText: 'hello',
    });
  });

  it('text -> subtitle -> inputText', () => {
    expect(mapOutputToInput('hello', 'llm', 'subtitle')).toEqual({
      inputText: 'hello',
    });
  });

  it('text -> videoGen -> inputPrompt', () => {
    expect(mapOutputToInput('prompt', 'prompt', 'videoGen')).toEqual({
      inputPrompt: 'prompt',
    });
  });

  it('text -> llm -> inputPrompt', () => {
    expect(mapOutputToInput('text', 'prompt', 'llm')).toEqual({
      inputPrompt: 'text',
    });
  });

  it('text -> motionControl -> inputPrompt', () => {
    expect(mapOutputToInput('text', 'llm', 'motionControl')).toEqual({
      inputPrompt: 'text',
    });
  });

  // Image source routing
  it('image -> imageGen -> inputImages array', () => {
    expect(mapOutputToInput('img.jpg', 'imageGen', 'imageGen')).toEqual({
      inputImages: ['img.jpg'],
    });
  });

  it('image -> videoGen -> inputImage', () => {
    expect(mapOutputToInput('img.jpg', 'image', 'videoGen')).toEqual({
      inputImage: 'img.jpg',
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
  it('audio -> lipSync -> inputAudio', () => {
    expect(mapOutputToInput('aud.mp3', 'textToSpeech', 'lipSync')).toEqual({
      inputAudio: 'aud.mp3',
    });
  });

  it('audio -> transcribe -> inputAudio', () => {
    expect(mapOutputToInput('aud.mp3', 'audio', 'transcribe')).toEqual({
      inputAudio: 'aud.mp3',
    });
  });

  // Incompatible
  it('returns null for incompatible types', () => {
    expect(mapOutputToInput('img.jpg', 'imageGen', 'transcribe')).toBeNull();
  });

  it('returns null for unknown source type', () => {
    expect(mapOutputToInput('val', 'unknownType', 'imageGen')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  collectGalleryUpdate                                                      */
/* -------------------------------------------------------------------------- */

describe('collectGalleryUpdate', () => {
  it('uses outputImages array when present', () => {
    const result = collectGalleryUpdate(
      { outputImages: ['a.jpg', 'b.jpg'] },
      'ignored.jpg',
      [],
      [],
    );
    expect(result).toEqual({ images: ['a.jpg', 'b.jpg'] });
  });

  it('uses currentOutput when outputImages absent', () => {
    const result = collectGalleryUpdate({}, 'single.jpg', [], []);
    expect(result).toEqual({ images: ['single.jpg'] });
  });

  it('deduplicates across existing, pending, and new', () => {
    const result = collectGalleryUpdate(
      { outputImages: ['a.jpg', 'b.jpg'] },
      'ignored',
      ['a.jpg', 'c.jpg'],
      ['b.jpg', 'd.jpg'],
    );
    expect(result).toEqual({ images: ['a.jpg', 'c.jpg', 'b.jpg', 'd.jpg'] });
  });

  it('returns images with empty string when outputImages is empty but currentOutput is empty string', () => {
    // empty outputImages falls through; '' is typeof string so gets pushed
    const result = collectGalleryUpdate({ outputImages: [] }, '', [], []);
    expect(result).toEqual({ images: [''] });
  });

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
  it('propagates through a linear chain A -> B -> C', () => {
    const nodes = [
      makeNode('A', 'prompt', { outputText: 'hello' }),
      makeNode('B', 'imageGen', {}),
      makeNode('C', 'download', {}),
    ];
    const edges = [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'C')];

    const updates = computeDownstreamUpdates('A', 'hello', nodes, edges);
    expect(updates.get('B')).toEqual({ inputPrompt: 'hello' });
    // B has no existing output so C should not get updates from BFS passthrough
  });

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

  it('returns empty map when source has no downstream edges', () => {
    const nodes = [makeNode('A', 'prompt', { outputText: 'hello' })];
    const edges: any[] = [];

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

  it('returns true when a primitive value differs', () => {
    const nodes = [makeNode('n1', 'imageGen', { inputPrompt: 'hello' })];
    const updates = new Map([['n1', { inputPrompt: 'world' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('returns true when array lengths differ', () => {
    const nodes = [makeNode('n1', 'gallery', { images: ['a.jpg'] })];
    const updates = new Map([['n1', { images: ['a.jpg', 'b.jpg'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('returns true when an array element differs', () => {
    const nodes = [makeNode('n1', 'gallery', { images: ['a.jpg', 'b.jpg'] })];
    const updates = new Map([['n1', { images: ['a.jpg', 'c.jpg'] }]]);
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

  it('returns true when existing value is undefined but update is set', () => {
    const nodes = [makeNode('n1', 'imageGen', {})];
    const updates = new Map([['n1', { inputPrompt: 'new' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
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

  it('returns unchanged nodes by reference', () => {
    const nodes = [
      makeNode('n1', 'imageGen', { inputPrompt: 'old' }),
      makeNode('n2', 'prompt', { prompt: 'keep' }),
    ];
    const updates = new Map([['n1', { inputPrompt: 'new' }]]);

    const result = applyNodeUpdates(nodes, updates);
    expect(result[1]).toBe(nodes[1]); // Same reference
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

  it('skips nodes without any output', () => {
    const nodes = [
      makeNode('n1', 'imageGen', {}),
      makeNode('n2', 'prompt', {}),
    ];
    const fn = vi.fn();

    propagateExistingOutputs(nodes, fn);

    expect(fn).not.toHaveBeenCalled();
  });

  it('handles empty nodes array', () => {
    const fn = vi.fn();
    propagateExistingOutputs([], fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

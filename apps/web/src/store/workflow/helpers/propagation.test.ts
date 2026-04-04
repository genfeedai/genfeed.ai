import { describe, expect, it, vi } from 'vitest';
import type { WorkflowEdge, WorkflowNode, WorkflowNodeData, NodeType } from '@genfeedai/types';
import {
  getNodeOutput,
  getOutputType,
  mapOutputToInput,
  collectGalleryUpdate,
  computeDownstreamUpdates,
  hasStateChanged,
  applyNodeUpdates,
  propagateExistingOutputs,
} from './propagation';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return {
    data: { label: type, status: 'idle', ...data } as WorkflowNodeData,
    id,
    position: { x: 0, y: 0 },
    type: type as NodeType,
  };
}

function makeEdge(source: string, target: string, id?: string): WorkflowEdge {
  return {
    id: id ?? `${source}-${target}`,
    source,
    target,
  };
}

// ===========================================================================
// A. getNodeOutput
// ===========================================================================

describe('getNodeOutput', () => {
  it('returns first element of outputImages array when present', () => {
    const node = makeNode('1', 'imageGen', { outputImages: ['img1.png', 'img2.png'] });
    expect(getNodeOutput(node)).toBe('img1.png');
  });

  it('returns outputImages[0] even when outputImage is also set', () => {
    const node = makeNode('1', 'imageGen', {
      outputImage: 'single.png',
      outputImages: ['arr.png'],
    });
    expect(getNodeOutput(node)).toBe('arr.png');
  });

  it('returns outputImage when outputImages is empty', () => {
    const node = makeNode('1', 'imageGen', { outputImage: 'single.png', outputImages: [] });
    expect(getNodeOutput(node)).toBe('single.png');
  });

  it('returns outputVideo when no image fields', () => {
    const node = makeNode('1', 'videoGen', { outputVideo: 'vid.mp4' });
    expect(getNodeOutput(node)).toBe('vid.mp4');
  });

  it('returns outputText for LLM nodes', () => {
    const node = makeNode('1', 'llm', { outputText: 'hello world' });
    expect(getNodeOutput(node)).toBe('hello world');
  });

  it('returns prompt from input nodes', () => {
    const node = makeNode('1', 'prompt', { prompt: 'a sunset' });
    expect(getNodeOutput(node)).toBe('a sunset');
  });

  it('returns first element when field is an array', () => {
    const node = makeNode('1', 'prompt', { prompt: ['a', 'b'] });
    expect(getNodeOutput(node)).toBe('a');
  });

  it('returns null when no output fields are set', () => {
    const node = makeNode('1', 'imageGen', {});
    expect(getNodeOutput(node)).toBeNull();
  });
});

// ===========================================================================
// B. getOutputType
// ===========================================================================

describe('getOutputType', () => {
  it('classifies prompt as text', () => {
    expect(getOutputType('prompt')).toBe('text');
  });

  it('classifies llm as text', () => {
    expect(getOutputType('llm')).toBe('text');
  });

  it('classifies imageGen as image', () => {
    expect(getOutputType('imageGen')).toBe('image');
  });

  it('classifies videoGen as video', () => {
    expect(getOutputType('videoGen')).toBe('video');
  });

  it('classifies textToSpeech as audio', () => {
    expect(getOutputType('textToSpeech')).toBe('audio');
  });

  it('returns null for unknown type', () => {
    expect(getOutputType('unknownNode')).toBeNull();
  });
});

// ===========================================================================
// C. mapOutputToInput
// ===========================================================================

describe('mapOutputToInput', () => {
  it('maps text → imageGen as inputPrompt', () => {
    expect(mapOutputToInput('hello', 'prompt', 'imageGen')).toEqual({ inputPrompt: 'hello' });
  });

  it('maps text → textToSpeech as inputText', () => {
    expect(mapOutputToInput('hello', 'llm', 'textToSpeech')).toEqual({ inputText: 'hello' });
  });

  it('maps text → subtitle as inputText', () => {
    expect(mapOutputToInput('sub', 'llm', 'subtitle')).toEqual({ inputText: 'sub' });
  });

  it('maps image → upscale with inputType', () => {
    expect(mapOutputToInput('img.png', 'imageGen', 'upscale')).toEqual({
      inputImage: 'img.png',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('maps image → videoGen as inputImage', () => {
    expect(mapOutputToInput('img.png', 'image', 'videoGen')).toEqual({ inputImage: 'img.png' });
  });

  it('maps image → imageGen as inputImages array', () => {
    expect(mapOutputToInput('img.png', 'imageGen', 'imageGen')).toEqual({
      inputImages: ['img.png'],
    });
  });

  it('maps video → download with inputType video', () => {
    expect(mapOutputToInput('vid.mp4', 'videoGen', 'download')).toEqual({
      inputImage: null,
      inputType: 'video',
      inputVideo: 'vid.mp4',
    });
  });

  it('maps image → download with inputType image', () => {
    expect(mapOutputToInput('img.png', 'imageGen', 'download')).toEqual({
      inputImage: 'img.png',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('maps video → lipSync as inputVideo', () => {
    expect(mapOutputToInput('vid.mp4', 'videoGen', 'lipSync')).toEqual({
      inputVideo: 'vid.mp4',
    });
  });

  it('maps audio → lipSync as inputAudio', () => {
    expect(mapOutputToInput('aud.mp3', 'textToSpeech', 'lipSync')).toEqual({
      inputAudio: 'aud.mp3',
    });
  });

  it('returns null for incompatible types', () => {
    expect(mapOutputToInput('aud.mp3', 'textToSpeech', 'imageGen')).toBeNull();
  });

  it('returns null for download with text source', () => {
    expect(mapOutputToInput('hello', 'prompt', 'download')).toBeNull();
  });
});

// ===========================================================================
// D. collectGalleryUpdate
// ===========================================================================

describe('collectGalleryUpdate', () => {
  it('collects images from outputImages array', () => {
    const result = collectGalleryUpdate(
      { outputImages: ['a.png', 'b.png'] },
      'fallback.png',
      [],
      []
    );
    expect(result).toEqual({ images: ['a.png', 'b.png'] });
  });

  it('falls back to currentOutput when no outputImages', () => {
    const result = collectGalleryUpdate({}, 'single.png', [], []);
    expect(result).toEqual({ images: ['single.png'] });
  });

  it('deduplicates across existing, pending, and new images', () => {
    const result = collectGalleryUpdate(
      { outputImages: ['a.png', 'b.png'] },
      'fallback.png',
      ['a.png', 'c.png'],
      ['b.png', 'd.png']
    );
    expect(result).toEqual({ images: ['a.png', 'c.png', 'b.png', 'd.png'] });
  });

  it('returns null when outputImages is empty and no currentOutput', () => {
    // Empty outputImages array means we fall back to currentOutput.
    // With an empty string currentOutput, allImages gets [''] which has length > 0.
    // To get null, sourceData must have no outputImages AND currentOutput must not be a string.
    // In practice this path is unreachable (currentOutput is always a string in BFS),
    // but we test the array-empty path with a non-string fallback for coverage.
    const result = collectGalleryUpdate(
      { outputImages: [] },
      undefined as unknown as string,
      [],
      []
    );
    expect(result).toBeNull();
  });
});

// ===========================================================================
// E. computeDownstreamUpdates
// ===========================================================================

describe('computeDownstreamUpdates', () => {
  it('propagates through a linear chain (prompt → imageGen)', () => {
    const nodes = [
      makeNode('prompt1', 'prompt', { prompt: 'sunset' }),
      makeNode('img1', 'imageGen'),
    ];
    const edges = [makeEdge('prompt1', 'img1')];

    const updates = computeDownstreamUpdates('prompt1', 'sunset', nodes, edges);
    expect(updates.get('img1')).toEqual({ inputPrompt: 'sunset' });
  });

  it('handles fan-out (one source → two targets)', () => {
    const nodes = [
      makeNode('prompt1', 'prompt', { prompt: 'cat' }),
      makeNode('img1', 'imageGen'),
      makeNode('img2', 'imageGen'),
    ];
    const edges = [makeEdge('prompt1', 'img1'), makeEdge('prompt1', 'img2')];

    const updates = computeDownstreamUpdates('prompt1', 'cat', nodes, edges);
    expect(updates.get('img1')).toEqual({ inputPrompt: 'cat' });
    expect(updates.get('img2')).toEqual({ inputPrompt: 'cat' });
  });

  it('handles diamond topology without double-processing', () => {
    const nodes = [
      makeNode('src', 'prompt', { prompt: 'x' }),
      makeNode('mid1', 'imageGen', { outputImage: 'mid1.png' }),
      makeNode('mid2', 'imageGen', { outputImage: 'mid2.png' }),
      makeNode('down', 'upscale'),
    ];
    const edges = [
      makeEdge('src', 'mid1'),
      makeEdge('src', 'mid2'),
      makeEdge('mid1', 'down'),
      makeEdge('mid2', 'down'),
    ];

    const updates = computeDownstreamUpdates('src', 'x', nodes, edges);
    expect(updates.has('mid1')).toBe(true);
    expect(updates.has('mid2')).toBe(true);
    // down should get an update from whichever mid node was visited first (mid1 via BFS order)
    expect(updates.has('down')).toBe(true);
  });

  it('prevents cycles', () => {
    const nodes = [
      makeNode('a', 'prompt', { prompt: 'loop' }),
      makeNode('b', 'imageGen', { outputImage: 'b.png' }),
    ];
    // Create a cycle: a → b → a
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')];

    // Should not infinite loop
    const updates = computeDownstreamUpdates('a', 'loop', nodes, edges);
    expect(updates.has('b')).toBe(true);
    // 'a' should not be in updates (it's the source, visited first)
    expect(updates.has('a')).toBe(false);
  });

  it('collects images for gallery nodes', () => {
    const nodes = [
      makeNode('img1', 'imageGen', { outputImages: ['a.png', 'b.png'] }),
      makeNode('gallery', 'outputGallery', { images: ['old.png'] }),
    ];
    const edges = [makeEdge('img1', 'gallery')];

    const updates = computeDownstreamUpdates('img1', 'a.png', nodes, edges);
    const galleryUpdate = updates.get('gallery');
    expect(galleryUpdate?.images).toEqual(['old.png', 'a.png', 'b.png']);
  });

  it('handles passthrough nodes (target with existing output re-enqueues)', () => {
    const nodes = [
      makeNode('prompt1', 'prompt', { prompt: 'hello' }),
      makeNode('img1', 'imageGen', { outputImage: 'existing.png' }),
      makeNode('upscale1', 'upscale'),
    ];
    const edges = [makeEdge('prompt1', 'img1'), makeEdge('img1', 'upscale1')];

    const updates = computeDownstreamUpdates('prompt1', 'hello', nodes, edges);
    expect(updates.get('img1')).toEqual({ inputPrompt: 'hello' });
    // img1 has outputImage so it should propagate to upscale1
    expect(updates.get('upscale1')).toEqual({
      inputImage: 'existing.png',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('handles orphan edges (target node missing)', () => {
    const nodes = [makeNode('a', 'prompt', { prompt: 'test' })];
    const edges = [makeEdge('a', 'missing')];

    const updates = computeDownstreamUpdates('a', 'test', nodes, edges);
    expect(updates.size).toBe(0);
  });

  it('returns empty map for empty graph', () => {
    const updates = computeDownstreamUpdates('nonexistent', 'val', [], []);
    expect(updates.size).toBe(0);
  });

  it('skips incompatible edge connections', () => {
    const nodes = [
      makeNode('audio1', 'textToSpeech', { outputAudio: 'speech.mp3' }),
      makeNode('img1', 'imageGen'),
    ];
    const edges = [makeEdge('audio1', 'img1')];

    const updates = computeDownstreamUpdates('audio1', 'speech.mp3', nodes, edges);
    // textToSpeech → imageGen is incompatible
    expect(updates.size).toBe(0);
  });

  it('aggregates gallery images from multiple sources', () => {
    const nodes = [
      makeNode('img1', 'imageGen', { outputImage: 'a.png' }),
      makeNode('img2', 'imageGen', { outputImage: 'b.png' }),
      makeNode('gallery', 'outputGallery', { images: [] }),
    ];
    // We need a shared source to trigger both, or call separately
    // In reality, gallery gets from multiple edges. Let's set up a prompt that fans out.
    const promptNode = makeNode('p', 'prompt', { prompt: 'x' });
    const allNodes = [promptNode, ...nodes];
    const edges = [
      makeEdge('p', 'img1'),
      makeEdge('p', 'img2'),
      makeEdge('img1', 'gallery'),
      makeEdge('img2', 'gallery'),
    ];

    const updates = computeDownstreamUpdates('p', 'x', allNodes, edges);
    const galleryUpdate = updates.get('gallery');
    expect(galleryUpdate?.images).toBeDefined();
    // Both images should appear in gallery
    const images = galleryUpdate?.images as string[];
    expect(images).toContain('a.png');
    expect(images).toContain('b.png');
  });
});

// ===========================================================================
// F. hasStateChanged
// ===========================================================================

describe('hasStateChanged', () => {
  it('detects primitive value change', () => {
    const nodes = [makeNode('1', 'imageGen', { inputPrompt: 'old' })];
    const updates = new Map([['1', { inputPrompt: 'new' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('returns false when primitive is unchanged', () => {
    const nodes = [makeNode('1', 'imageGen', { inputPrompt: 'same' })];
    const updates = new Map([['1', { inputPrompt: 'same' }]]);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });

  it('detects array length change', () => {
    const nodes = [makeNode('1', 'outputGallery', { images: ['a.png'] })];
    const updates = new Map([['1', { images: ['a.png', 'b.png'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('detects array content change', () => {
    const nodes = [makeNode('1', 'outputGallery', { images: ['a.png'] })];
    const updates = new Map([['1', { images: ['b.png'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(true);
  });

  it('returns false when arrays are identical', () => {
    const nodes = [makeNode('1', 'outputGallery', { images: ['a.png', 'b.png'] })];
    const updates = new Map([['1', { images: ['a.png', 'b.png'] }]]);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });
});

// ===========================================================================
// G. applyNodeUpdates
// ===========================================================================

describe('applyNodeUpdates', () => {
  it('applies updates to matching nodes', () => {
    const nodes = [makeNode('1', 'imageGen', { inputPrompt: 'old' })];
    const updates = new Map([['1', { inputPrompt: 'new' }]]);

    const result = applyNodeUpdates(nodes, updates);
    expect((result[0].data as Record<string, unknown>).inputPrompt).toBe('new');
  });

  it('preserves reference equality for unchanged nodes', () => {
    const node1 = makeNode('1', 'imageGen');
    const node2 = makeNode('2', 'prompt');
    const updates = new Map([['1', { inputPrompt: 'val' }]]);

    const result = applyNodeUpdates([node1, node2], updates);
    expect(result[1]).toBe(node2); // Same reference
    expect(result[0]).not.toBe(node1); // New object
  });

  it('returns same-length array with empty updates map', () => {
    const nodes = [makeNode('1', 'imageGen'), makeNode('2', 'prompt')];
    const updates = new Map<string, Record<string, unknown>>();

    const result = applyNodeUpdates(nodes, updates);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(nodes[0]);
    expect(result[1]).toBe(nodes[1]);
  });
});

// ===========================================================================
// H. Integration tests (full pipeline)
// ===========================================================================

describe('integration: full propagation pipeline', () => {
  it('prompt → imageGen: computes and detects change', () => {
    const nodes = [makeNode('p1', 'prompt', { prompt: 'sunset' }), makeNode('ig1', 'imageGen')];
    const edges = [makeEdge('p1', 'ig1')];

    const updates = computeDownstreamUpdates('p1', 'sunset', nodes, edges);
    expect(hasStateChanged(updates, nodes)).toBe(true);

    const result = applyNodeUpdates(nodes, updates);
    expect((result[1].data as Record<string, unknown>).inputPrompt).toBe('sunset');
  });

  it('skips no-op when values already match', () => {
    const nodes = [
      makeNode('p1', 'prompt', { prompt: 'sunset' }),
      makeNode('ig1', 'imageGen', { inputPrompt: 'sunset' }),
    ];
    const edges = [makeEdge('p1', 'ig1')];

    const updates = computeDownstreamUpdates('p1', 'sunset', nodes, edges);
    expect(hasStateChanged(updates, nodes)).toBe(false);
  });

  it('multi-hop chain: prompt → imageGen → upscale', () => {
    const nodes = [
      makeNode('p1', 'prompt', { prompt: 'cat' }),
      makeNode('ig1', 'imageGen', { outputImage: 'cat.png' }),
      makeNode('up1', 'upscale'),
    ];
    const edges = [makeEdge('p1', 'ig1'), makeEdge('ig1', 'up1')];

    const updates = computeDownstreamUpdates('p1', 'cat', nodes, edges);
    expect(updates.get('ig1')).toEqual({ inputPrompt: 'cat' });
    expect(updates.get('up1')).toEqual({
      inputImage: 'cat.png',
      inputType: 'image',
      inputVideo: null,
    });
  });

  it('gallery receives images from upstream imageGen', () => {
    const nodes = [
      makeNode('ig1', 'imageGen', { outputImages: ['x.png', 'y.png'] }),
      makeNode('g1', 'outputGallery', { images: [] }),
    ];
    const edges = [makeEdge('ig1', 'g1')];

    const updates = computeDownstreamUpdates('ig1', 'x.png', nodes, edges);
    const applied = applyNodeUpdates(nodes, updates);
    const galleryData = applied[1].data as Record<string, unknown>;
    expect(galleryData.images).toEqual(['x.png', 'y.png']);
  });

  it('returns empty updates for missing source node', () => {
    const nodes = [makeNode('ig1', 'imageGen')];
    const edges = [makeEdge('missing', 'ig1')];

    const updates = computeDownstreamUpdates('missing', 'val', nodes, edges);
    expect(updates.size).toBe(0);
  });
});

// ===========================================================================
// I. propagateExistingOutputs
// ===========================================================================

describe('propagateExistingOutputs', () => {
  it('calls propagateFn for nodes with outputImages', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'imageGen', { outputImages: ['a.png', 'b.png'] })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('calls propagateFn for nodes with outputImage', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'imageGen', { outputImage: 'single.png' })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('calls propagateFn for nodes with outputVideo', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'videoGen', { outputVideo: 'vid.mp4' })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('calls propagateFn for nodes with prompt (prompt node)', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'prompt', { prompt: 'a sunset over the ocean' })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('calls propagateFn for nodes with extractedTweet', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'tweetExtractor', { extractedTweet: 'tweet content' })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('calls propagateFn for nodes with video (video input node)', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'video', { video: 'input-video.mp4' })];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(1);
    expect(propagateFn).toHaveBeenCalledWith('1');
  });

  it('does NOT call propagateFn for nodes with no output', () => {
    const propagateFn = vi.fn();
    const nodes = [makeNode('1', 'imageGen', {})];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).not.toHaveBeenCalled();
  });

  it('calls propagateFn for each qualifying node in a mixed array', () => {
    const propagateFn = vi.fn();
    const nodes = [
      makeNode('has-images', 'imageGen', { outputImages: ['a.png'] }),
      makeNode('empty', 'imageGen', {}),
      makeNode('has-prompt', 'prompt', { prompt: 'hello' }),
      makeNode('also-empty', 'videoGen', {}),
      makeNode('has-video', 'videoGen', { outputVideo: 'v.mp4' }),
    ];

    propagateExistingOutputs(nodes, propagateFn);

    expect(propagateFn).toHaveBeenCalledTimes(3);
    expect(propagateFn).toHaveBeenCalledWith('has-images');
    expect(propagateFn).toHaveBeenCalledWith('has-prompt');
    expect(propagateFn).toHaveBeenCalledWith('has-video');
    expect(propagateFn).not.toHaveBeenCalledWith('empty');
    expect(propagateFn).not.toHaveBeenCalledWith('also-empty');
  });
});

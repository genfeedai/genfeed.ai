import { describe, expect, it } from 'vitest';
import {
  detectCycles,
  getCompatibleHandles,
  getHandleType,
  isValidConnection,
  validateWorkflow,
} from './validation';

describe('detectCycles', () => {
  it('should return false for empty graph', () => {
    expect(detectCycles([], [])).toBe(false);
  });

  it('should return false for single node without edges', () => {
    const nodes = [{ id: 'A' }];
    expect(detectCycles(nodes, [])).toBe(false);
  });

  it('should return false for linear graph (no cycles)', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];
    expect(detectCycles(nodes, edges)).toBe(false);
  });

  it('should return false for diamond graph (no cycles)', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
      { source: 'C', target: 'D' },
    ];
    expect(detectCycles(nodes, edges)).toBe(false);
  });

  it('should return true for simple cycle (A -> B -> A)', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'A' },
    ];
    expect(detectCycles(nodes, edges)).toBe(true);
  });

  it('should return true for self-loop', () => {
    const nodes = [{ id: 'A' }];
    const edges = [{ source: 'A', target: 'A' }];
    expect(detectCycles(nodes, edges)).toBe(true);
  });

  it('should return true for cycle in longer chain', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
      { source: 'D', target: 'B' }, // Creates cycle B -> C -> D -> B
    ];
    expect(detectCycles(nodes, edges)).toBe(true);
  });

  it('should return true when cycle exists in disconnected component', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' }, // Linear A -> B
      { source: 'C', target: 'D' },
      { source: 'D', target: 'C' }, // Cycle C <-> D
    ];
    expect(detectCycles(nodes, edges)).toBe(true);
  });
});

describe('validateWorkflow', () => {
  it('should return valid for empty workflow', () => {
    const result = validateWorkflow([], []);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return valid for workflow with input node only', () => {
    const nodes = [{ id: 'node1', type: 'prompt' }];
    const result = validateWorkflow(nodes, []);
    expect(result.isValid).toBe(true);
  });

  it('should return error when imageGen missing required prompt input', () => {
    const nodes = [{ id: 'imageGen1', type: 'imageGen' }];
    const result = validateWorkflow(nodes, []);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some((e) => e.message.includes('Missing required input')),
    ).toBe(true);
  });

  it('should return valid when imageGen has required prompt connected', () => {
    const nodes = [
      { id: 'prompt1', type: 'prompt' },
      { id: 'imageGen1', type: 'imageGen' },
    ];
    const edges = [
      { source: 'prompt1', target: 'imageGen1', targetHandle: 'prompt' },
    ];

    const result = validateWorkflow(nodes, edges);

    // Should not have missing prompt error
    const promptErrors = result.errors.filter(
      (e) => e.nodeId === 'imageGen1' && e.message.includes('Prompt'),
    );
    expect(promptErrors).toHaveLength(0);
  });

  it('should return error when workflow contains a cycle', () => {
    const nodes = [
      { id: 'A', type: 'prompt' },
      { id: 'B', type: 'llm' },
    ];
    const edges = [
      { source: 'A', target: 'B', targetHandle: 'prompt' },
      { source: 'B', target: 'A', targetHandle: null },
    ];

    const result = validateWorkflow(nodes, edges);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('cycle'))).toBe(true);
  });

  it('should return valid for complete image generation workflow', () => {
    const nodes = [
      { id: 'prompt1', type: 'prompt' },
      { id: 'imageInput1', type: 'imageInput' },
      { id: 'imageGen1', type: 'imageGen' },
      { id: 'preview1', type: 'preview' },
    ];
    const edges = [
      { source: 'prompt1', target: 'imageGen1', targetHandle: 'prompt' },
      { source: 'imageInput1', target: 'imageGen1', targetHandle: 'images' },
      { source: 'imageGen1', target: 'preview1', targetHandle: 'media' },
    ];

    const result = validateWorkflow(nodes, edges);

    // Check for cycle errors specifically
    const cycleErrors = result.errors.filter((e) =>
      e.message.includes('cycle'),
    );
    expect(cycleErrors).toHaveLength(0);
  });

  it('should skip unknown node types gracefully', () => {
    const nodes = [{ id: 'unknown1', type: 'unknownNodeType' }];
    const result = validateWorkflow(nodes, []);

    // Should not throw, should return valid (no rules to validate)
    expect(result).toBeDefined();
  });

  it('should return error for video generator without prompt', () => {
    const nodes = [{ id: 'videoGen1', type: 'videoGen' }];
    const result = validateWorkflow(nodes, []);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Prompt'))).toBe(true);
  });

  it('should return error for download node without media input', () => {
    const nodes = [{ id: 'download1', type: 'download' }];
    const result = validateWorkflow(nodes, []);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Media'))).toBe(true);
  });

  it('should return error for lipSync without required audio', () => {
    const nodes = [{ id: 'lipSync1', type: 'lipSync' }];
    const result = validateWorkflow(nodes, []);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Audio'))).toBe(true);
  });
});

describe('getHandleType', () => {
  it('should return image type for imageInput output', () => {
    const result = getHandleType('imageInput', 'image', 'source');
    expect(result).toBe('image');
  });

  it('should return text type for prompt output', () => {
    const result = getHandleType('prompt', 'text', 'source');
    expect(result).toBe('text');
  });

  it('should return text type for imageGen prompt input', () => {
    const result = getHandleType('imageGen', 'prompt', 'target');
    expect(result).toBe('text');
  });

  it('should return image type for imageGen images input', () => {
    const result = getHandleType('imageGen', 'images', 'target');
    expect(result).toBe('image');
  });

  it('should return video type for videoGen output', () => {
    const result = getHandleType('videoGen', 'video', 'source');
    expect(result).toBe('video');
  });

  it('should return audio type for audioInput output', () => {
    const result = getHandleType('audioInput', 'audio', 'source');
    expect(result).toBe('audio');
  });

  it('should return null for unknown node type', () => {
    // Testing invalid type handling - using 'never' to bypass type checking
    const result = getHandleType('unknownType' as never, 'handle', 'source');
    expect(result).toBeNull();
  });

  it('should return null for unknown handle id', () => {
    const result = getHandleType('imageInput', 'unknownHandle', 'source');
    expect(result).toBeNull();
  });

  it('should return null for null handle id', () => {
    const result = getHandleType('imageInput', null, 'source');
    expect(result).toBeNull();
  });
});

describe('isValidConnection', () => {
  it('should return true for text to text connection', () => {
    const result = isValidConnection('prompt', 'text', 'imageGen', 'prompt');
    expect(result).toBe(true);
  });

  it('should return true for image to image connection', () => {
    const result = isValidConnection(
      'imageInput',
      'image',
      'imageGen',
      'images',
    );
    expect(result).toBe(true);
  });

  it('should return true for video to video connection', () => {
    const result = isValidConnection(
      'videoInput',
      'video',
      'animation',
      'video',
    );
    expect(result).toBe(true);
  });

  it('should return true for audio to audio connection', () => {
    const result = isValidConnection('audioInput', 'audio', 'lipSync', 'audio');
    expect(result).toBe(true);
  });

  it('should return false for mismatched types (text to image)', () => {
    const result = isValidConnection('prompt', 'text', 'imageGen', 'images');
    expect(result).toBe(false);
  });

  it('should return false for mismatched types (image to text)', () => {
    const result = isValidConnection(
      'imageInput',
      'image',
      'imageGen',
      'prompt',
    );
    expect(result).toBe(false);
  });

  it('should return false for unknown source node type', () => {
    // Testing invalid type handling - using 'never' to bypass type checking
    const result = isValidConnection(
      'unknownType' as never,
      'handle',
      'imageGen',
      'prompt',
    );
    expect(result).toBe(false);
  });

  it('should return false for unknown target node type', () => {
    // Testing invalid type handling - using 'never' to bypass type checking
    const result = isValidConnection(
      'prompt',
      'text',
      'unknownType' as never,
      'handle',
    );
    expect(result).toBe(false);
  });

  it('should return false for null source handle', () => {
    const result = isValidConnection('prompt', null, 'imageGen', 'prompt');
    expect(result).toBe(false);
  });

  it('should return false for null target handle', () => {
    const result = isValidConnection('prompt', 'text', 'imageGen', null);
    expect(result).toBe(false);
  });
});

describe('getCompatibleHandles', () => {
  it('should return image for image type', () => {
    const result = getCompatibleHandles('image');
    expect(result).toContain('image');
  });

  it('should return text for text type', () => {
    const result = getCompatibleHandles('text');
    expect(result).toContain('text');
  });

  it('should return video for video type', () => {
    const result = getCompatibleHandles('video');
    expect(result).toContain('video');
  });

  it('should return audio for audio type', () => {
    const result = getCompatibleHandles('audio');
    expect(result).toContain('audio');
  });

  it('should return number for number type', () => {
    const result = getCompatibleHandles('number');
    expect(result).toContain('number');
  });

  it('should return empty array for unknown type', () => {
    // Testing invalid type handling - using 'never' to bypass type checking
    const result = getCompatibleHandles('unknownType' as never);
    expect(result).toEqual([]);
  });
});

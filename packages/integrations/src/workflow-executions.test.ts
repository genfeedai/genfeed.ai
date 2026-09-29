import { describe, expect, it } from 'vitest';

import {
  extractWorkflowExecutionSnapshot,
  extractWorkflowOutputsFromExecution,
  isWorkflowExecutionTerminalStatus,
} from './workflow-executions';

describe('extractWorkflowExecutionSnapshot', () => {
  it('should extract from direct nodeResults format', () => {
    const payload = {
      error: 'something went wrong',
      executionId: 'exec-123',
      nodeResults: [{ output: { text: 'hello' }, status: 'completed' }],
      progress: 75,
      status: 'running',
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result).toEqual({
      error: 'something went wrong',
      executionId: 'exec-123',
      nodeResults: [{ output: { text: 'hello' }, status: 'completed' }],
      progress: 75,
      status: 'running',
    });
  });

  it('should extract from JSON:API envelope format (data.attributes)', () => {
    const payload = {
      data: {
        attributes: {
          error: 'timeout',
          nodeResults: [{ output: { imageUrl: 'https://img.jpg' } }],
          progress: 50,
          status: 'failed',
        },
        id: 'exec-456',
      },
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result).toEqual({
      error: 'timeout',
      executionId: 'exec-456',
      nodeResults: [{ output: { imageUrl: 'https://img.jpg' } }],
      progress: 50,
      status: 'failed',
    });
  });

  it('should use attributes.id as executionId fallback when data.id is missing', () => {
    const payload = {
      data: {
        attributes: {
          id: 'attr-id',
          nodeResults: [],
        },
      },
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result.executionId).toBe('attr-id');
  });
});

describe('extractWorkflowOutputsFromExecution', () => {
  it('should return empty array for null payload', () => {
    expect(extractWorkflowOutputsFromExecution(null)).toEqual([]);
  });

  it('should extract image output from nodeResults', () => {
    const payload = {
      nodeResults: [
        {
          output: {
            caption: 'A cat',
            imageUrl: 'https://cdn.example.com/img.png',
          },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: 'A cat',
        type: 'image',
        url: 'https://cdn.example.com/img.png',
      },
    ]);
  });

  it('should extract nested audio output from music.musicUrl', () => {
    const payload = {
      nodeResults: [
        {
          output: { music: { musicUrl: 'https://cdn.example.com/music.m4a' } },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'audio',
        url: 'https://cdn.example.com/music.m4a',
      },
    ]);
  });

  it('should deduplicate outputs by text', () => {
    const payload = {
      nodeResults: [
        { output: { text: 'Duplicate text' }, status: 'completed' },
        { output: { text: 'Duplicate text' }, status: 'completed' },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toHaveLength(1);
  });

  it('should skip nodes with empty output', () => {
    const payload = {
      nodeResults: [
        { output: {}, status: 'completed' },
        { output: undefined, status: 'completed' },
        {
          output: { imageUrl: 'https://cdn.example.com/img.png' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toHaveLength(1);
  });

  it('should default to image type from mediaUrl with unknown extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/file.jpg' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'image',
        url: 'https://cdn.example.com/file.jpg',
      },
    ]);
  });

  it('should infer audio type for .aac extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/sound.aac' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('audio');
  });

  it('should handle mediaUrl with query parameters', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/file.mp4?token=abc' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('video');
  });

  it('should handle multiple different outputs', () => {
    const payload = {
      nodeResults: [
        {
          output: { imageUrl: 'https://cdn.example.com/img.png' },
          status: 'completed',
        },
        {
          output: { videoUrl: 'https://cdn.example.com/vid.mp4' },
          status: 'completed',
        },
        { output: { text: 'Description' }, status: 'completed' },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toHaveLength(3);
    expect(result[0]?.type).toBe('image');
    expect(result[1]?.type).toBe('video');
    expect(result[2]?.type).toBe('text');
  });
});

describe('isWorkflowExecutionTerminalStatus', () => {
  it('should return true for "completed"', () => {
    expect(isWorkflowExecutionTerminalStatus('completed')).toBe(true);
  });
});

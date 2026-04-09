import { describe, expect, it } from 'vitest';

import {
  extractWorkflowExecutionSnapshot,
  extractWorkflowOutputsFromExecution,
  isWorkflowExecutionTerminalStatus,
} from './workflow-executions';

describe('extractWorkflowExecutionSnapshot', () => {
  it('should return empty snapshot for null payload', () => {
    const result = extractWorkflowExecutionSnapshot(null);

    expect(result).toEqual({
      error: undefined,
      executionId: undefined,
      nodeResults: [],
      progress: undefined,
      status: undefined,
    });
  });

  it('should return empty snapshot for undefined payload', () => {
    const result = extractWorkflowExecutionSnapshot(undefined);

    expect(result).toEqual({
      error: undefined,
      executionId: undefined,
      nodeResults: [],
      progress: undefined,
      status: undefined,
    });
  });

  it('should return empty snapshot for non-object payload', () => {
    const result = extractWorkflowExecutionSnapshot('string-value');

    expect(result).toEqual({
      error: undefined,
      executionId: undefined,
      nodeResults: [],
      progress: undefined,
      status: undefined,
    });
  });

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

  it('should ignore non-string error fields', () => {
    const payload = {
      error: 42,
      nodeResults: [],
      status: 'completed',
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result.error).toBeUndefined();
  });

  it('should ignore non-number progress fields', () => {
    const payload = {
      nodeResults: [],
      progress: 'fifty',
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result.progress).toBeUndefined();
  });

  it('should return empty nodeResults when attributes.nodeResults is not an array', () => {
    const payload = {
      data: {
        attributes: {
          nodeResults: 'not-an-array',
        },
      },
    };

    const result = extractWorkflowExecutionSnapshot(payload);

    expect(result.nodeResults).toEqual([]);
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

  it('should extract video output from nodeResults', () => {
    const payload = {
      nodeResults: [
        {
          output: { videoUrl: 'https://cdn.example.com/vid.mp4' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'video',
        url: 'https://cdn.example.com/vid.mp4',
      },
    ]);
  });

  it('should extract audio output from nodeResults', () => {
    const payload = {
      nodeResults: [
        {
          output: { audioUrl: 'https://cdn.example.com/audio.mp3' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'audio',
        url: 'https://cdn.example.com/audio.mp3',
      },
    ]);
  });

  it('should extract audio from musicUrl field', () => {
    const payload = {
      nodeResults: [
        {
          output: { musicUrl: 'https://cdn.example.com/song.wav' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'audio',
        url: 'https://cdn.example.com/song.wav',
      },
    ]);
  });

  it('should extract nested video output from video.videoUrl', () => {
    const payload = {
      nodeResults: [
        {
          output: { video: { videoUrl: 'https://cdn.example.com/nested.mp4' } },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'video',
        url: 'https://cdn.example.com/nested.mp4',
      },
    ]);
  });

  it('should extract nested audio output from audio.audioUrl', () => {
    const payload = {
      nodeResults: [
        {
          output: { audio: { audioUrl: 'https://cdn.example.com/nested.ogg' } },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'audio',
        url: 'https://cdn.example.com/nested.ogg',
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

  it('should extract text output when no media URLs are present', () => {
    const payload = {
      nodeResults: [
        {
          output: { text: 'Hello world' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([{ text: 'Hello world', type: 'text' }]);
  });

  it('should prefer message field when text is absent', () => {
    const payload = {
      nodeResults: [
        {
          output: { message: 'A message' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([{ text: 'A message', type: 'text' }]);
  });

  it('should prefer content field when text and message are absent', () => {
    const payload = {
      nodeResults: [
        {
          output: { content: 'Some content' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([{ text: 'Some content', type: 'text' }]);
  });

  it('should use caption from label field as fallback', () => {
    const payload = {
      nodeResults: [
        {
          output: {
            imageUrl: 'https://cdn.example.com/img.png',
            label: 'The label',
          },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: 'The label',
        type: 'image',
        url: 'https://cdn.example.com/img.png',
      },
    ]);
  });

  it('should use caption from prompt field as fallback', () => {
    const payload = {
      nodeResults: [
        {
          output: {
            imageUrl: 'https://cdn.example.com/img.png',
            prompt: 'The prompt',
          },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: 'The prompt',
        type: 'image',
        url: 'https://cdn.example.com/img.png',
      },
    ]);
  });

  it('should deduplicate outputs by URL', () => {
    const payload = {
      nodeResults: [
        {
          output: { imageUrl: 'https://cdn.example.com/img.png' },
          status: 'completed',
        },
        {
          output: { imageUrl: 'https://cdn.example.com/img.png' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toHaveLength(1);
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

  it('should infer video type from mediaUrl with video extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/file.mp4' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'video',
        url: 'https://cdn.example.com/file.mp4',
      },
    ]);
  });

  it('should infer audio type from mediaUrl with audio extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/file.mp3' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'audio',
        url: 'https://cdn.example.com/file.mp3',
      },
    ]);
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

  it('should infer video type for .mov extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/clip.mov' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('video');
  });

  it('should infer video type for .webm extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/clip.webm' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('video');
  });

  it('should infer audio type for .wav extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/sound.wav' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('audio');
  });

  it('should infer audio type for .ogg extension', () => {
    const payload = {
      nodeResults: [
        {
          output: { mediaUrl: 'https://cdn.example.com/sound.ogg' },
          status: 'completed',
        },
      ],
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result[0]?.type).toBe('audio');
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

  it('should handle JSON:API envelope format', () => {
    const payload = {
      data: {
        attributes: {
          nodeResults: [
            {
              output: { imageUrl: 'https://cdn.example.com/img.png' },
              status: 'completed',
            },
          ],
          status: 'completed',
        },
        id: 'exec-789',
      },
    };

    const result = extractWorkflowOutputsFromExecution(payload);

    expect(result).toEqual([
      {
        caption: undefined,
        type: 'image',
        url: 'https://cdn.example.com/img.png',
      },
    ]);
  });
});

describe('isWorkflowExecutionTerminalStatus', () => {
  it('should return true for "completed"', () => {
    expect(isWorkflowExecutionTerminalStatus('completed')).toBe(true);
  });

  it('should return true for "failed"', () => {
    expect(isWorkflowExecutionTerminalStatus('failed')).toBe(true);
  });

  it('should return true for "cancelled"', () => {
    expect(isWorkflowExecutionTerminalStatus('cancelled')).toBe(true);
  });

  it('should return false for "running"', () => {
    expect(isWorkflowExecutionTerminalStatus('running')).toBe(false);
  });

  it('should return false for "pending"', () => {
    expect(isWorkflowExecutionTerminalStatus('pending')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isWorkflowExecutionTerminalStatus(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isWorkflowExecutionTerminalStatus('')).toBe(false);
  });
});

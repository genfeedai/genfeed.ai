import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createLipSyncExecutor,
  type LipSyncExecutor,
  type LipSyncResolver,
} from '@workflow-engine/executors/saas/lip-sync-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { mode: 'image', ...configOverrides },
    id: 'lip-sync-1',
    inputs: [],
    label: 'Lip Sync',
    type: 'lipSync',
  };
}

function makeContext(): ExecutionContext {
  return {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
}

function makeInput(
  configOverrides: Record<string, unknown> = {},
  inputEntries: [string, unknown][] = [],
): ExecutorInput {
  return {
    context: makeContext(),
    inputs: new Map<string, unknown>(inputEntries),
    node: makeNode(configOverrides),
  };
}

describe('LipSyncExecutor', () => {
  let executor: LipSyncExecutor;
  let mockResolver: LipSyncResolver;

  beforeEach(() => {
    executor = createLipSyncExecutor();
    mockResolver = vi
      .fn()
      .mockResolvedValue({ videoUrl: 'https://cdn.example.com/synced.mp4' });
    executor.setResolver(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid config', () => {
      const node = makeNode({ mode: 'video' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass with no mode (optional)', () => {
      const node = makeNode({});
      // Remove mode to test optional
      delete node.config.mode;
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
    });

    it('should fail with invalid mode', () => {
      const node = makeNode({ mode: 'audio' });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid mode. Must be: video or image');
    });

    it('should fail when node type does not match', () => {
      const node = makeNode();
      node.type = 'wrongType';
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Expected node type lipSync');
    });
  });

  describe('estimateCost', () => {
    it('should return 10 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(10);
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createLipSyncExecutor();
      const input = makeInput({}, [
        ['video', 'https://cdn.example.com/video.mp4'],
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'LipSync resolver not configured',
      );
    });

    it('should throw when no video or image input is provided', async () => {
      const input = makeInput({}, [
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      await expect(executor.execute(input)).rejects.toThrow(
        'Missing required input: video or image',
      );
    });

    it('should throw when audio input is missing', async () => {
      const input = makeInput({}, [
        ['video', 'https://cdn.example.com/video.mp4'],
      ]);

      await expect(executor.execute(input)).rejects.toThrow(
        'Missing required input: audio',
      );
    });

    it('should call resolver with video input and return result', async () => {
      const input = makeInput({ mode: 'video' }, [
        ['video', 'https://cdn.example.com/video.mp4'],
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      const result = await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/video.mp4',
        'https://cdn.example.com/audio.mp3',
        { mode: 'video' },
        input.context,
        input.node,
      );
      expect(result.data).toEqual({
        videoUrl: 'https://cdn.example.com/synced.mp4',
      });
      expect(result.metadata?.mode).toBe('video');
    });

    it('should call resolver with image input when video is absent', async () => {
      const input = makeInput({ mode: 'image' }, [
        ['image', 'https://cdn.example.com/face.png'],
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/face.png',
        'https://cdn.example.com/audio.mp3',
        { mode: 'image' },
        input.context,
        input.node,
      );
    });

    it('should default mode to image when not specified', async () => {
      const input = makeInput({}, [
        ['video', 'https://cdn.example.com/video.mp4'],
        ['audio', 'https://cdn.example.com/audio.mp3'],
      ]);
      // Remove mode from config
      delete input.node.config.mode;

      const result = await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { mode: 'image' },
        expect.anything(),
        expect.anything(),
      );
      expect(result.metadata?.mode).toBe('image');
    });
  });
});

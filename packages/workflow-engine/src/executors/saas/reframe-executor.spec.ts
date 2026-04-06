import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createReframeExecutor,
  type ReframeExecutor,
  type ReframeResolver,
} from '@workflow-engine/executors/saas/reframe-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { targetAspectRatio: '9:16', ...configOverrides },
    id: 'reframe-1',
    inputs: [],
    label: 'Reframe',
    type: 'reframe',
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

describe('ReframeExecutor', () => {
  let executor: ReframeExecutor;
  let mockResolver: ReframeResolver;

  beforeEach(() => {
    executor = createReframeExecutor();
    mockResolver = vi.fn().mockResolvedValue({
      format: 'portrait',
      mediaUrl: 'https://cdn.example.com/reframed.mp4',
      targetAspectRatio: '9:16',
    });
    executor.setResolver(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid targetAspectRatio', () => {
      const node = makeNode({ targetAspectRatio: '16:9' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when targetAspectRatio is missing', () => {
      const node = makeNode({});
      delete node.config.targetAspectRatio;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Target aspect ratio is required for reframing',
      );
    });

    it('should fail when targetAspectRatio is not a string', () => {
      const node = makeNode({ targetAspectRatio: 1.77 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Target aspect ratio is required for reframing',
      );
    });

    it('should fail when node type does not match', () => {
      const node = makeNode();
      node.type = 'wrongType';
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should return 3 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(3);
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createReframeExecutor();
      const input = makeInput({}, [
        ['media', 'https://cdn.example.com/video.mp4'],
      ]);

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'Reframe resolver not configured',
      );
    });

    it('should throw when media input is missing', async () => {
      const input = makeInput({}, []);

      await expect(executor.execute(input)).rejects.toThrow(
        'Media input is required for reframing',
      );
    });

    it('should call resolver with correct parameters', async () => {
      const input = makeInput(
        { format: 'portrait', targetAspectRatio: '9:16' },
        [['media', 'https://cdn.example.com/video.mp4']],
      );

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/video.mp4',
        { format: 'portrait', targetAspectRatio: '9:16' },
        input.context,
        input.node,
      );
    });

    it('should default format to landscape', async () => {
      const input = makeInput({ targetAspectRatio: '16:9' }, [
        ['media', 'https://cdn.example.com/video.mp4'],
      ]);
      delete input.node.config.format;

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        expect.any(String),
        { format: 'landscape', targetAspectRatio: '16:9' },
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return result data and metadata', async () => {
      const input = makeInput({ targetAspectRatio: '9:16' }, [
        ['media', 'https://cdn.example.com/video.mp4'],
      ]);

      const result = await executor.execute(input);

      expect(result.data).toEqual({
        format: 'portrait',
        mediaUrl: 'https://cdn.example.com/reframed.mp4',
        targetAspectRatio: '9:16',
      });
      expect(result.metadata?.format).toBe('portrait');
      expect(result.metadata?.targetAspectRatio).toBe('9:16');
    });
  });
});

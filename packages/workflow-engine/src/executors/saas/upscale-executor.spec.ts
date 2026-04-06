import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createUpscaleExecutor,
  type UpscaleExecutor,
  type UpscaleResolver,
} from '@workflow-engine/executors/saas/upscale-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { model: 'topaz-standard', ...configOverrides },
    id: 'upscale-1',
    inputs: [],
    label: 'Upscale',
    type: 'upscale',
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

describe('UpscaleExecutor', () => {
  let executor: UpscaleExecutor;
  let mockResolver: UpscaleResolver;

  beforeEach(() => {
    executor = createUpscaleExecutor();
    mockResolver = vi.fn().mockResolvedValue({
      mediaUrl: 'https://cdn.example.com/upscaled.png',
      model: 'topaz-standard',
      scale: '4x',
    });
    executor.setResolver(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid model', () => {
      const node = makeNode({ model: 'topaz-standard' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when model is missing', () => {
      const node = makeNode({});
      delete node.config.model;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model is required for upscaling');
    });

    it('should fail when model is not a string', () => {
      const node = makeNode({ model: 42 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Model is required for upscaling');
    });

    it('should fail when node type does not match', () => {
      const node = makeNode();
      node.type = 'wrongType';
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should return 5 credits', () => {
      expect(executor.estimateCost(makeNode())).toBe(5);
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createUpscaleExecutor();
      const input = makeInput({}, [
        ['media', 'https://cdn.example.com/image.png'],
      ]);

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'Upscale resolver not configured',
      );
    });

    it('should throw when media input is missing', async () => {
      const input = makeInput({}, []);

      await expect(executor.execute(input)).rejects.toThrow(
        'Media input is required for upscaling',
      );
    });

    it('should call resolver with correct parameters', async () => {
      const input = makeInput({ model: 'topaz-standard', scale: '4x' }, [
        ['media', 'https://cdn.example.com/image.png'],
      ]);

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        'https://cdn.example.com/image.png',
        { model: 'topaz-standard', scale: '4x' },
        input.context,
        input.node,
      );
    });

    it('should default scale to 2x when not specified', async () => {
      const input = makeInput({ model: 'topaz-standard' }, [
        ['media', 'https://cdn.example.com/image.png'],
      ]);
      delete input.node.config.scale;

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith(
        expect.any(String),
        { model: 'topaz-standard', scale: '2x' },
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return result data and metadata', async () => {
      const input = makeInput({ model: 'topaz-standard', scale: '4x' }, [
        ['media', 'https://cdn.example.com/image.png'],
      ]);

      const result = await executor.execute(input);

      expect(result.data).toEqual({
        mediaUrl: 'https://cdn.example.com/upscaled.png',
        model: 'topaz-standard',
        scale: '4x',
      });
      expect(result.metadata?.model).toBe('topaz-standard');
      expect(result.metadata?.scale).toBe('4x');
    });
  });
});

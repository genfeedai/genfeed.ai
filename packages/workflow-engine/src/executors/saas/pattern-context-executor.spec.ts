import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createPatternContextExecutor,
  PatternContextExecutor,
  type PatternContextResolver,
} from '@workflow-engine/executors/saas/pattern-context-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeNode(
  configOverrides: Record<string, unknown> = {},
): ExecutableNode {
  return {
    config: { brandId: 'brand-123', ...configOverrides },
    id: 'pattern-ctx-1',
    inputs: [],
    label: 'Pattern Context',
    type: 'patternContext',
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

const mockPatterns = [
  { score: 0.9, template: 'Question opening', type: 'hook' },
  { score: 0.85, template: 'Swipe up', type: 'cta' },
];

describe('PatternContextExecutor', () => {
  let executor: PatternContextExecutor;
  let mockResolver: PatternContextResolver;

  beforeEach(() => {
    mockResolver = vi.fn().mockResolvedValue(mockPatterns);
    executor = createPatternContextExecutor(mockResolver);
  });

  describe('validate', () => {
    it('should pass with valid brandId', () => {
      const node = makeNode({ brandId: 'brand-123' });
      const result = executor.validate(node);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when brandId is missing', () => {
      const node = makeNode({});
      delete node.config.brandId;
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Brand ID is required');
    });

    it('should fail when brandId is not a string', () => {
      const node = makeNode({ brandId: 123 });
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Brand ID is required');
    });

    it('should fail when node type does not match', () => {
      const node = makeNode();
      node.type = 'wrongType';
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Expected node type patternContext');
    });
  });

  describe('execute', () => {
    it('should throw when resolver is not configured', async () => {
      const noResolverExecutor = createPatternContextExecutor();
      const input = makeInput();

      await expect(noResolverExecutor.execute(input)).rejects.toThrow(
        'Pattern context resolver not configured',
      );
    });

    it('should call resolver with brandId and organizationId', async () => {
      const input = makeInput({ brandId: 'brand-456' });

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith('brand-456', 'org-1', {
        limit: 10,
        patternTypes: undefined,
      });
    });

    it('should pass custom limit to resolver', async () => {
      const input = makeInput({ brandId: 'brand-456', limit: 5 });

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith('brand-456', 'org-1', {
        limit: 5,
        patternTypes: undefined,
      });
    });

    it('should pass patternTypes when provided', async () => {
      const input = makeInput({
        brandId: 'brand-456',
        patternTypes: ['hook', 'cta'],
      });

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith('brand-456', 'org-1', {
        limit: 10,
        patternTypes: ['hook', 'cta'],
      });
    });

    it('should omit patternTypes when array is empty', async () => {
      const input = makeInput({
        brandId: 'brand-456',
        patternTypes: [],
      });

      await executor.execute(input);

      expect(mockResolver).toHaveBeenCalledWith('brand-456', 'org-1', {
        limit: 10,
        patternTypes: undefined,
      });
    });

    it('should return patterns data and metadata', async () => {
      const input = makeInput({ brandId: 'brand-456' });

      const result = await executor.execute(input);

      expect(result.data).toEqual({ patterns: mockPatterns });
      expect(result.metadata?.brandId).toBe('brand-456');
      expect(result.metadata?.patternCount).toBe(2);
    });

    it('should return zero count when no patterns found', async () => {
      (mockResolver as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const input = makeInput({ brandId: 'brand-456' });

      const result = await executor.execute(input);

      expect(result.data).toEqual({ patterns: [] });
      expect(result.metadata?.patternCount).toBe(0);
    });
  });

  describe('createPatternContextExecutor', () => {
    it('should create executor without resolver', () => {
      const exec = createPatternContextExecutor();
      expect(exec.nodeType).toBe('patternContext');
    });

    it('should create executor with resolver', () => {
      const resolver = vi.fn();
      const exec = createPatternContextExecutor(resolver);
      expect(exec.nodeType).toBe('patternContext');
    });
  });
});

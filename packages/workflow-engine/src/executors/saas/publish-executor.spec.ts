import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createPublishExecutor,
  type PublishExecutor,
  type PublishResolver,
} from '@workflow-engine/executors/saas/publish-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputMap?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'pub-1',
    inputs: [],
    label: 'Publish',
    type: 'publish',
  };
  const inputs = new Map<string, unknown>(Object.entries(inputMap ?? {}));
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('PublishExecutor', () => {
  let executor: PublishExecutor;
  let resolver: PublishResolver;

  beforeEach(() => {
    resolver = vi.fn().mockResolvedValue({
      platforms: ['twitter'],
      postIds: ['post-1'],
      scheduledFor: null,
      status: 'published',
    });
    executor = createPublishExecutor(resolver);
  });

  describe('validate', () => {
    it('returns valid for correct config', () => {
      const node: ExecutableNode = {
        config: {
          platforms: { twitter: true },
          schedule: { type: 'immediate' },
        },
        id: '1',
        inputs: [],
        label: 'Publish',
        type: 'publish',
      };
      expect(executor.validate(node).valid).toBe(true);
    });

    it('requires platforms', () => {
      const node: ExecutableNode = {
        config: {},
        id: '1',
        inputs: [],
        label: 'Publish',
        type: 'publish',
      };
      expect(executor.validate(node).valid).toBe(false);
      expect(executor.validate(node).errors).toContain(
        'Platforms configuration is required',
      );
    });

    it('requires at least one enabled platform', () => {
      const node: ExecutableNode = {
        config: { platforms: { twitter: false } },
        id: '1',
        inputs: [],
        label: 'P',
        type: 'publish',
      };
      expect(executor.validate(node).valid).toBe(false);
    });

    it('requires datetime for scheduled posts', () => {
      const node: ExecutableNode = {
        config: {
          platforms: { twitter: true },
          schedule: { type: 'scheduled' },
        },
        id: '1',
        inputs: [],
        label: 'P',
        type: 'publish',
      };
      expect(executor.validate(node).valid).toBe(false);
    });
  });

  describe('execute', () => {
    it('throws without resolver', async () => {
      const exec = createPublishExecutor();
      const input = makeInput(
        { platforms: { twitter: true } },
        { brand: { brandId: 'b-1' }, media: 'img.png' },
      );
      await expect(exec.execute(input)).rejects.toThrow('resolver');
    });

    it('publishes immediately', async () => {
      const input = makeInput(
        { caption: 'Hello', platforms: { twitter: true } },
        { brand: { brandId: 'b-1' }, media: 'img.png' },
      );
      const result = await executor.execute(input);
      expect(result.metadata?.postCount).toBe(1);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'b-1', caption: 'Hello' }),
      );
    });

    it('prefers caption from input over config', async () => {
      const input = makeInput(
        { caption: 'config', platforms: { twitter: true } },
        { brand: { brandId: 'b-1' }, caption: 'input', media: 'img' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'input' }),
      );
    });

    it('handles scheduled publish', async () => {
      const input = makeInput(
        {
          platforms: { twitter: true },
          schedule: { datetime: '2025-06-01T12:00:00Z', type: 'scheduled' },
        },
        { brand: { brandId: 'b-1' }, media: 'img' },
      );
      const result = await executor.execute(input);
      expect(result.metadata?.scheduledFor).toBeTruthy();
    });
  });
});

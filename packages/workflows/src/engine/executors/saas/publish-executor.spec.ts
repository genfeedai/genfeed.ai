import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  createPublishExecutor,
  nextOccurrenceFromPostingTime,
  type PublishExecutor,
  type PublishResolver,
} from './publish-executor';

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
          platforms: ['twitter'],
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
        config: { platforms: [] },
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
          platforms: ['twitter'],
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
        { platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, media: 'img.png' },
      );
      await expect(exec.execute(input)).rejects.toThrow('resolver');
    });

    it('publishes immediately', async () => {
      const input = makeInput(
        { caption: 'Hello', platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, media: 'img.png' },
      );
      const result = await executor.execute(input);
      expect(result.metadata?.postCount).toBe(1);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'b-1', caption: 'Hello' }),
      );
    });

    it('forwards workflowId from context to the resolver', async () => {
      const input = makeInput(
        { caption: 'Test', platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, media: 'img.png' },
      );
      await executor.execute(input);
      // context.workflowId is 'wf-1' in makeInput
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 'wf-1' }),
      );
    });

    it('prefers caption from input over config', async () => {
      const input = makeInput(
        { caption: 'config', platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, caption: 'input', media: 'img' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'input' }),
      );
    });

    it('supports text-only publishing when caption input is present', async () => {
      const input = makeInput(
        { platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, caption: 'text post' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'text post', media: undefined }),
      );
    });

    it('requires media or caption', async () => {
      const input = makeInput(
        { platforms: ['twitter'] },
        { brand: { brandId: 'b-1' } },
      );
      await expect(executor.execute(input)).rejects.toThrow(
        'Missing publish media or caption input',
      );
    });

    it('handles scheduled publish', async () => {
      const input = makeInput(
        {
          platforms: ['twitter'],
          schedule: { datetime: '2025-06-01T12:00:00Z', type: 'scheduled' },
        },
        { brand: { brandId: 'b-1' }, media: 'img' },
      );
      const result = await executor.execute(input);
      expect(result.metadata?.scheduledFor).toBeTruthy();
    });

    it('accepts a brand id string from the brand handle', async () => {
      const input = makeInput(
        { platforms: ['twitter'] },
        { brand: 'b-1', caption: 'text post' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'b-1' }),
      );
    });

    it('schedules from best posting times on the schedule handle', async () => {
      const input = makeInput(
        { platforms: ['twitter'] },
        {
          brand: { brandId: 'b-1' },
          caption: 'text post',
          schedule: [
            { avgEngagement: 0.1, dayOfWeek: 1, hour: 9 },
            { avgEngagement: 0.4, dayOfWeek: 2, hour: 18 },
          ],
        },
      );

      const result = await executor.execute(input);
      const scheduledFor = result.metadata?.scheduledFor;

      expect(typeof scheduledFor).toBe('string');
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledFor: expect.any(Date),
        }),
      );
      const scheduledDate = new Date(String(scheduledFor));
      expect(scheduledDate.getUTCDay()).toBe(2);
      expect(scheduledDate.getUTCHours()).toBe(18);
    });

    it('wraps a same-day posting slot that already passed to next week', () => {
      const now = new Date(Date.UTC(2026, 7, 18, 19, 0, 0));
      const next = nextOccurrenceFromPostingTime(
        { dayOfWeek: 2, hour: 18 },
        now,
      );

      expect(next.toISOString()).toBe('2026-08-25T18:00:00.000Z');
    });

    it('falls back to config schedule when posting times are empty', async () => {
      const input = makeInput(
        { platforms: ['twitter'] },
        { brand: { brandId: 'b-1' }, caption: 'text post', schedule: [] },
      );

      const result = await executor.execute(input);
      expect(result.metadata?.scheduledFor).toBeNull();
    });
  });
});

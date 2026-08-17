import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  createPublishExecutor,
  type PublishExecutor,
  type PublishResolver,
  resolveOptimalScheduleTime,
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

    it('forwards workflowId from context to the resolver', async () => {
      const input = makeInput(
        { caption: 'Test', platforms: { twitter: true } },
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
        { caption: 'config', platforms: { twitter: true } },
        { brand: { brandId: 'b-1' }, caption: 'input', media: 'img' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'input' }),
      );
    });

    it('supports text-only publishing when caption input is present', async () => {
      const input = makeInput(
        { platforms: { twitter: true } },
        { brand: { brandId: 'b-1' }, caption: 'text post' },
      );
      await executor.execute(input);
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ caption: 'text post', media: undefined }),
      );
    });

    it('requires media or caption', async () => {
      const input = makeInput(
        { platforms: { twitter: true } },
        { brand: { brandId: 'b-1' } },
      );
      await expect(executor.execute(input)).rejects.toThrow(
        'Missing publish media or caption input',
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

    describe('optimal schedule', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it('schedules for the highest-engagement posting slot from bestPostingTimes', async () => {
        vi.useFakeTimers();
        // Monday 2026-08-17T09:00:00Z
        vi.setSystemTime(new Date('2026-08-17T09:00:00.000Z'));

        const input = makeInput(
          {
            platforms: { twitter: true },
            schedule: { type: 'optimal' },
          },
          {
            bestPostingTimes: [
              { avgEngagement: 3.1, dayOfWeek: 3, hour: 14 },
              { avgEngagement: 9.4, dayOfWeek: 5, hour: 17 },
            ],
            brand: { brandId: 'b-1' },
            media: 'img',
          },
        );

        const result = await executor.execute(input);

        expect(result.metadata?.scheduleType).toBe('optimal');
        expect(result.metadata?.scheduledFor).toBe('2026-08-21T17:00:00.000Z');
        expect(resolver).toHaveBeenCalledWith(
          expect.objectContaining({
            scheduledFor: new Date('2026-08-21T17:00:00.000Z'),
          }),
        );
      });

      it('falls back to immediate publish when no best posting times are available', async () => {
        const input = makeInput(
          { platforms: { twitter: true }, schedule: { type: 'optimal' } },
          { brand: { brandId: 'b-1' }, media: 'img' },
        );

        const result = await executor.execute(input);

        expect(result.metadata?.scheduleType).toBe('optimal');
        expect(result.metadata?.scheduledFor).toBeNull();
      });
    });
  });
});

describe('resolveOptimalScheduleTime', () => {
  it('picks the slot with the highest average engagement', () => {
    const now = new Date('2026-08-17T09:00:00.000Z'); // Monday
    const resolved = resolveOptimalScheduleTime(
      [
        { avgEngagement: 5, dayOfWeek: 2, hour: 10 },
        { avgEngagement: 12, dayOfWeek: 4, hour: 20 },
        { avgEngagement: 8, dayOfWeek: 1, hour: 8 },
      ],
      now,
    );

    expect(resolved?.toISOString()).toBe('2026-08-20T20:00:00.000Z');
  });

  it('rolls over to next week when the slot already passed this week', () => {
    // Monday 2026-08-17T09:00:00Z, slot is Monday 08:00 (already passed).
    const now = new Date('2026-08-17T09:00:00.000Z');
    const resolved = resolveOptimalScheduleTime(
      [{ avgEngagement: 1, dayOfWeek: 1, hour: 8 }],
      now,
    );

    expect(resolved?.toISOString()).toBe('2026-08-24T08:00:00.000Z');
  });

  it('returns null when there are no posting times', () => {
    expect(resolveOptimalScheduleTime(undefined, new Date())).toBeNull();
    expect(resolveOptimalScheduleTime([], new Date())).toBeNull();
  });

  it('returns null for an out-of-range slot instead of throwing', () => {
    const resolved = resolveOptimalScheduleTime(
      [{ avgEngagement: 1, dayOfWeek: 9, hour: 8 }],
      new Date('2026-08-17T09:00:00.000Z'),
    );
    expect(resolved).toBeNull();
  });
});

import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createDelayExecutor,
  type DelayExecutor,
  durationToMs,
  type OptimalTimeResolver,
} from '@workflow-engine/executors/saas/delay-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputData?: unknown,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'delay-1',
    inputs: [],
    label: 'Delay',
    type: 'delay',
  };
  const inputs = new Map<string, unknown>();
  if (inputData !== undefined) {
    inputs.set('trigger', inputData);
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('durationToMs', () => {
  it('converts minutes to ms', () => {
    expect(durationToMs(5, 'minutes')).toBe(300_000);
  });

  it('converts hours to ms', () => {
    expect(durationToMs(2, 'hours')).toBe(7_200_000);
  });

  it('converts days to ms', () => {
    expect(durationToMs(1, 'days')).toBe(86_400_000);
  });

  it('returns 0 for negative duration', () => {
    expect(durationToMs(-5, 'minutes')).toBe(0);
  });
});

describe('DelayExecutor', () => {
  let executor: DelayExecutor;

  beforeEach(() => {
    executor = createDelayExecutor();
  });

  describe('fixed mode', () => {
    it('calculates delay in milliseconds', async () => {
      const input = makeInput({ duration: 10, mode: 'fixed', unit: 'minutes' });
      const result = await executor.execute(input);

      expect(result.metadata?.mode).toBe('fixed');
      expect(result.metadata?.requiresDelayedJob).toBe(true);
      expect((result.data as any).delayMs).toBeGreaterThan(0);
      expect((result.data as any).state.config.mode).toBe('fixed');
    });

    it('passes through input data', async () => {
      const input = makeInput(
        { duration: 1, mode: 'fixed', unit: 'seconds' },
        { foo: 'bar' },
      );
      const result = await executor.execute(input);
      expect((result.data as any).data).toEqual({ foo: 'bar' });
    });
  });

  describe('until mode', () => {
    it('calculates delay until future time', async () => {
      const futureTime = new Date(Date.now() + 60_000).toISOString();
      const input = makeInput({ mode: 'until', untilTime: futureTime });
      const result = await executor.execute(input);

      expect((result.data as any).delayMs).toBeGreaterThan(0);
      expect(result.metadata?.resumeAt).toBe(futureTime);
    });

    it('resumes immediately for past time', async () => {
      const pastTime = new Date(Date.now() - 60_000).toISOString();
      const input = makeInput({ mode: 'until', untilTime: pastTime });
      const result = await executor.execute(input);

      expect((result.data as any).delayMs).toBe(0);
    });

    it('throws on missing untilTime', async () => {
      const input = makeInput({ mode: 'until' });
      await expect(executor.execute(input)).rejects.toThrow('untilTime');
    });
  });

  describe('optimal mode', () => {
    it('throws without resolver', async () => {
      const input = makeInput({ mode: 'optimal', platform: 'instagram' });
      await expect(executor.execute(input)).rejects.toThrow('resolver');
    });

    it('uses resolver when configured', async () => {
      const futureDate = new Date(Date.now() + 3_600_000);
      const resolver: OptimalTimeResolver = {
        getOptimalPostingTime: vi.fn().mockResolvedValue(futureDate),
      };
      executor.setOptimalTimeResolver(resolver);

      const input = makeInput({ mode: 'optimal', platform: 'instagram' });
      const result = await executor.execute(input);

      expect(resolver.getOptimalPostingTime).toHaveBeenCalledWith(
        'org-1',
        'instagram',
        undefined,
      );
      expect((result.data as any).delayMs).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    it('returns valid for correct fixed config', () => {
      const node: ExecutableNode = {
        config: { duration: 5, mode: 'fixed', unit: 'minutes' },
        id: '1',
        inputs: [],
        label: 'Delay',
        type: 'delay',
      };
      expect(executor.validate(node).valid).toBe(true);
    });

    it('returns errors for missing mode', () => {
      const node: ExecutableNode = {
        config: {},
        id: '1',
        inputs: [],
        label: 'Delay',
        type: 'delay',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Delay mode is required');
    });

    it('returns errors for missing duration in fixed mode', () => {
      const node: ExecutableNode = {
        config: { mode: 'fixed' },
        id: '1',
        inputs: [],
        label: 'Delay',
        type: 'delay',
      };
      const result = executor.validate(node);
      expect(result.valid).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('returns 0', () => {
      const node: ExecutableNode = {
        config: {},
        id: '1',
        inputs: [],
        label: 'Delay',
        type: 'delay',
      };
      expect(executor.estimateCost(node)).toBe(0);
    });
  });
});

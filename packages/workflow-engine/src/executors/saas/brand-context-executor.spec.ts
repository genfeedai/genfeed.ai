import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createBrandContextExecutor } from '@workflow-engine/executors/saas/brand-context-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('BrandContextExecutor', () => {
  it('validates with brandId', () => {
    expect(
      createBrandContextExecutor().validate({
        config: { brandId: 'b-1' },
        id: '1',
        inputs: [],
        label: 'BC',
        type: 'brandContext',
      }).valid,
    ).toBe(true);
  });
  it('invalid without brandId', () => {
    expect(
      createBrandContextExecutor().validate({
        config: {},
        id: '1',
        inputs: [],
        label: 'BC',
        type: 'brandContext',
      }).valid,
    ).toBe(false);
  });
  it('throws without resolver', async () => {
    await expect(
      createBrandContextExecutor().execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BC',
          type: 'brandContext',
        },
      }),
    ).rejects.toThrow('resolver');
  });
  it('resolves context', async () => {
    const resolver = vi.fn().mockResolvedValue({
      brandId: 'b-1',
      colors: null,
      fonts: null,
      handle: '@t',
      label: 'T',
      models: null,
      voice: 'casual',
    });
    const exec = createBrandContextExecutor(resolver);
    const result = await exec.execute({
      context: ctx,
      inputs: new Map(),
      node: {
        config: { brandId: 'b-1' },
        id: '1',
        inputs: [],
        label: 'BC',
        type: 'brandContext',
      },
    });
    expect((result.data as any).voice).toBe('casual');
  });
  it('throws when not found', async () => {
    const resolver = vi.fn().mockResolvedValue(null);
    const exec = createBrandContextExecutor(resolver);
    await expect(
      exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { brandId: 'b-x' },
          id: '1',
          inputs: [],
          label: 'BC',
          type: 'brandContext',
        },
      }),
    ).rejects.toThrow('not found');
  });
});

import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createBrandExecutor } from '@workflow-engine/executors/saas/brand-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};
const brandData = {
  brandId: 'b-1',
  colors: null,
  fonts: null,
  handle: '@t',
  label: 'Test',
  models: null,
  voice: null,
};

describe('BrandExecutor', () => {
  it('validates with brandId', () => {
    expect(
      createBrandExecutor().validate({
        config: { brandId: 'b-1' },
        id: '1',
        inputs: [],
        label: 'B',
        type: 'brand',
      }).valid,
    ).toBe(true);
  });
  it('invalid without brandId', () => {
    expect(
      createBrandExecutor().validate({
        config: {},
        id: '1',
        inputs: [],
        label: 'B',
        type: 'brand',
      }).valid,
    ).toBe(false);
  });
  it('throws without resolver', async () => {
    await expect(
      createBrandExecutor().execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'brand',
        },
      }),
    ).rejects.toThrow('resolver');
  });
  it('resolves brand', async () => {
    const resolver = vi.fn().mockResolvedValue(brandData);
    const exec = createBrandExecutor(resolver);
    const result = await exec.execute({
      context: ctx,
      inputs: new Map(),
      node: {
        config: { brandId: 'b-1' },
        id: '1',
        inputs: [],
        label: 'B',
        type: 'brand',
      },
    });
    expect(result.data).toEqual(brandData);
    expect(result.metadata?.brandId).toBe('b-1');
  });
  it('throws when not found', async () => {
    const resolver = vi.fn().mockResolvedValue(null);
    const exec = createBrandExecutor(resolver);
    await expect(
      exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { brandId: 'b-x' },
          id: '1',
          inputs: [],
          label: 'B',
          type: 'brand',
        },
      }),
    ).rejects.toThrow('not found');
  });
});

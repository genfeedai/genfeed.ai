import type { ExecutionContext } from '@workflow-engine/execution/engine';
import { createBrandAssetExecutor } from '@workflow-engine/executors/saas/brand-asset-executor';
import { describe, expect, it, vi } from 'vitest';

const ctx: ExecutionContext = {
  organizationId: 'org-1',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

describe('BrandAssetExecutor', () => {
  describe('validate', () => {
    it('valid config', () => {
      expect(
        createBrandAssetExecutor().validate({
          config: { assetType: 'logo', brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        }).valid,
      ).toBe(true);
    });
    it('invalid without brandId', () => {
      expect(
        createBrandAssetExecutor().validate({
          config: { assetType: 'logo' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        }).valid,
      ).toBe(false);
    });
    it('invalid without assetType', () => {
      expect(
        createBrandAssetExecutor().validate({
          config: { brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        }).valid,
      ).toBe(false);
    });
    it('invalid assetType', () => {
      expect(
        createBrandAssetExecutor().validate({
          config: { assetType: 'avatar', brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        }).valid,
      ).toBe(false);
    });
  });

  describe('execute', () => {
    it('throws without resolver', async () => {
      await expect(
        createBrandAssetExecutor().execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: { assetType: 'logo', brandId: 'b-1' },
            id: '1',
            inputs: [],
            label: 'BA',
            type: 'brandAsset',
          },
        }),
      ).rejects.toThrow('resolver');
    });

    it('returns single url for logo', async () => {
      const resolver = vi.fn().mockResolvedValue({
        dimensions: null,
        mimeType: 'image/png',
        url: 'http://logo.png',
        urls: [],
      });
      const exec = createBrandAssetExecutor(resolver);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { assetType: 'logo', brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        },
      });
      expect(result.data).toBe('http://logo.png');
    });

    it('returns urls for references', async () => {
      const resolver = vi.fn().mockResolvedValue({
        dimensions: null,
        mimeType: null,
        url: null,
        urls: ['a.png', 'b.png'],
      });
      const exec = createBrandAssetExecutor(resolver);
      const result = await exec.execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { assetType: 'references', brandId: 'b-1' },
          id: '1',
          inputs: [],
          label: 'BA',
          type: 'brandAsset',
        },
      });
      expect(result.data).toEqual(['a.png', 'b.png']);
    });

    it('throws when not found', async () => {
      const resolver = vi.fn().mockResolvedValue(null);
      const exec = createBrandAssetExecutor(resolver);
      await expect(
        exec.execute({
          context: ctx,
          inputs: new Map(),
          node: {
            config: { assetType: 'logo', brandId: 'b-1' },
            id: '1',
            inputs: [],
            label: 'BA',
            type: 'brandAsset',
          },
        }),
      ).rejects.toThrow('not found');
    });
  });
});

import { ModelCategory } from '@genfeedai/enums';
import { FalProviderService } from '@services/ai/providers/fal/fal-provider.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('FalProviderService', () => {
  let service: FalProviderService;

  beforeEach(() => {
    service = new FalProviderService();
  });

  describe('isConfigured', () => {
    it('should return false when no API key is set', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true after setting API key', () => {
      service.setApiKey('test-key');
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('getPredefinedModels', () => {
    it('should return predefined fal.ai models', () => {
      const models = service.getPredefinedModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include FLUX Dev model', () => {
      const models = service.getPredefinedModels();
      const fluxDev = models.find((m) => m.key === 'fal-ai/flux/dev');
      expect(fluxDev).toBeDefined();
      expect(fluxDev?.label).toBe('FLUX Dev');
      expect(fluxDev?.category).toBe(ModelCategory.IMAGE);
    });

    it('should include FLUX Schnell model', () => {
      const models = service.getPredefinedModels();
      const schnell = models.find((m) => m.key === 'fal-ai/flux/schnell');
      expect(schnell).toBeDefined();
      expect(schnell?.speedTier).toBe('fast');
    });

    it('should include FLUX Pro model', () => {
      const models = service.getPredefinedModels();
      const pro = models.find((m) => m.key === 'fal-ai/flux-pro');
      expect(pro).toBeDefined();
      expect(pro?.qualityTier).toBe('ultra');
    });

    it('should include Kling Video model', () => {
      const models = service.getPredefinedModels();
      const kling = models.find((m) => m.key === 'fal-ai/kling-video');
      expect(kling).toBeDefined();
      expect(kling?.category).toBe(ModelCategory.VIDEO);
    });

    it('should include Seedance 2.0 model', () => {
      const models = service.getPredefinedModels();
      const seedance = models.find((m) => m.key === 'fal-ai/seedance-2.0');
      expect(seedance).toBeDefined();
      expect(seedance?.category).toBe(ModelCategory.VIDEO);
      expect(seedance?.qualityTier).toBe('ultra');
    });

    it('should have valid pricing for all models', () => {
      const models = service.getPredefinedModels();
      for (const model of models) {
        expect(model.cost).toBeGreaterThan(0);
        expect(model.costPerUnit).toBeGreaterThan(0);
        expect(model.pricingType).toBe('per-request');
      }
    });

    it('should have all models marked as active', () => {
      const models = service.getPredefinedModels();
      for (const model of models) {
        expect(model.isActive).toBe(true);
        expect(model.isDefault).toBe(false);
      }
    });
  });

  describe('discoverModels', () => {
    it('should throw when API key is not configured', async () => {
      await expect(service.discoverModels()).rejects.toThrow(
        'FAL_API_KEY not configured',
      );
    });

    it('should return empty array on fetch failure', async () => {
      service.setApiKey('test-key');
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error'),
      );
      const models = await service.discoverModels();
      expect(models).toEqual([]);
      vi.restoreAllMocks();
    });

    it('should map fetched models to GenFeed format', async () => {
      service.setApiKey('test-key');
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({
          items: [
            {
              category: 'text-to-image',
              id: 'fal-ai/test-model',
              pricingInfoOverride: 'Your request will cost $0.01 per image.',
              shortDescription: 'A test model',
              tags: [],
              title: 'Test Model',
            },
          ],
          page: 1,
          pages: 1,
        }),
        ok: true,
      } as Response);

      const models = await service.discoverModels();
      expect(models).toHaveLength(1);
      expect(models[0].label).toBe('Test Model');
      expect(models[0].provider).toBe('fal');
      expect(models[0].isActive).toBe(true);
      expect(models[0].capabilities).toContain('Text Prompt');
      vi.restoreAllMocks();
    });
  });

  describe('getModelPricing', () => {
    it('should return 0 when not configured', async () => {
      const price = await service.getModelPricing('some-model');
      expect(price).toBe(0);
    });

    it('should fetch and calculate pricing with 70% margin', async () => {
      service.setApiKey('test-key');
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({
          items: [
            {
              id: 'fal-ai/test-model',
              pricingInfoOverride: 'Your request will cost $0.15 per image.',
              title: 'Test Model',
            },
          ],
          page: 1,
          pages: 1,
        }),
        ok: true,
      } as Response);

      const price = await service.getModelPricing('fal-ai/test-model');
      // applyMargin(0.15) = Math.ceil(0.15 / 0.30 / 0.01) = 50 credits
      expect(price).toBe(50);
      vi.restoreAllMocks();
    });

    it('should return minimum 2 credits for zero cost', async () => {
      service.setApiKey('test-key');
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        json: async () => ({
          items: [{ id: 'fal-ai/test-model', title: 'Test Model' }],
          page: 1,
          pages: 1,
        }),
        ok: true,
      } as Response);

      const price = await service.getModelPricing('fal-ai/test-model');
      expect(price).toBe(2);
      vi.restoreAllMocks();
    });

    it('should return 0 on fetch failure', async () => {
      service.setApiKey('test-key');
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('Network error'),
      );
      const price = await service.getModelPricing('test-model');
      expect(price).toBe(0);
      vi.restoreAllMocks();
    });
  });
});

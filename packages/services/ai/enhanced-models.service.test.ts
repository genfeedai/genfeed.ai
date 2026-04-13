import { ModelProvider } from '@genfeedai/enums';
import { EnhancedModelsService } from '@services/ai/enhanced-models.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the base ModelsService using the same path the SUT imports.
vi.mock('@services/ai/models.service', () => ({
  ModelsService: class MockModelsService {
    ModelClass = class {};
    constructor(public token: string) {}
    async findAll() {
      return [];
    }
    async update(_id: string, _data: any) {
      return {};
    }
    async create(data: any) {
      return data;
    }
  },
}));

// Mock the client
vi.mock('@genfeedai/client/models', () => ({
  Model: class MockModel {},
}));

describe('EnhancedModelsService', () => {
  let service: EnhancedModelsService;

  beforeEach(() => {
    service = new EnhancedModelsService('test-token');
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(service).toBeInstanceOf(EnhancedModelsService);
    });
  });

  describe('initialize', () => {
    it('should initialize without config', async () => {
      await service.initialize();
      // Should not throw
    });

    it('should initialize with fal API key', async () => {
      await service.initialize({ falApiKey: 'test-fal-key' });
      // Should not throw
    });
  });

  describe('getFalModels', () => {
    it('should return empty array when not initialized', async () => {
      const models = await service.getFalModels();
      expect(models).toEqual([]);
    });

    it('should return predefined models when initialized without API key', async () => {
      await service.initialize();
      const models = await service.getFalModels();
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('getAllModels', () => {
    it('should return base models when not initialized', async () => {
      const models = await service.getAllModels();
      expect(Array.isArray(models)).toBe(true);
    });

    it('should include fal models when initialized', async () => {
      await service.initialize();
      const models = await service.getAllModels({ includeDynamic: true });
      expect(Array.isArray(models)).toBe(true);
    });

    it('should exclude dynamic models when flag is false', async () => {
      await service.initialize();
      const models = await service.getAllModels({ includeDynamic: false });
      expect(Array.isArray(models)).toBe(true);
    });

    it('should merge provider-discovered models into the stable catalog shape', async () => {
      await service.initialize();

      vi.spyOn(service, 'getFalModels').mockResolvedValue([
        {
          category: 'image',
          isActive: true,
          key: 'fal-ai/smoke-model',
          label: 'Smoke Model',
          provider: ModelProvider.FAL,
        } as never,
      ]);
      vi.spyOn(service, 'getHuggingFaceModels').mockResolvedValue([]);

      const models = await service.getAllModels({ includeDynamic: true });
      const smokeModel = models.find(
        (model) => model.key === 'fal-ai/smoke-model',
      );

      expect(smokeModel).toMatchObject({
        category: 'image',
        isActive: true,
        key: 'fal-ai/smoke-model',
        label: 'Smoke Model',
        provider: ModelProvider.FAL,
      });
      expect(smokeModel?.createdAt).toBeInstanceOf(Date);
      expect(smokeModel?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('getModelsByProvider', () => {
    it('should filter models by provider', async () => {
      await service.initialize();
      const models = await service.getModelsByProvider(ModelProvider.FAL);
      for (const model of models) {
        expect(model.provider).toBe(ModelProvider.FAL);
      }
    });
  });

  describe('syncFalPricing', () => {
    it('should return error when FAL API key not configured', async () => {
      await service.initialize();
      const result = await service.syncFalPricing();
      expect(result.errors).toContain('FAL API key not configured');
      expect(result.updated).toBe(0);
    });
  });

  describe('addDiscoveredFalModels', () => {
    it('should return error when FAL API key not configured', async () => {
      await service.initialize();
      const result = await service.addDiscoveredFalModels();
      expect(result.errors).toContain('FAL API key not configured');
      expect(result.added).toBe(0);
    });
  });

  describe('searchModels', () => {
    it('should search by text query', async () => {
      await service.initialize();
      const results = await service.searchModels({ search: 'flux' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter by provider', async () => {
      await service.initialize();
      const results = await service.searchModels({
        provider: ModelProvider.FAL,
      });
      for (const model of results) {
        expect(model.provider).toBe(ModelProvider.FAL);
      }
    });
  });

  describe('getModelStats', () => {
    it('should return stats object', async () => {
      await service.initialize();
      const stats = await service.getModelStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byProvider');
      expect(stats).toHaveProperty('byCategory');
      expect(stats).toHaveProperty('falConfigured');
    });
  });

  describe('getEnhancedInstance', () => {
    it('should return a new instance', () => {
      const instance = EnhancedModelsService.getEnhancedInstance('test-token');
      expect(instance).toBeInstanceOf(EnhancedModelsService);
    });
  });
});

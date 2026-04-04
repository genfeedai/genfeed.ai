import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelCategory, ModelProvider, PricingType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ModelPricingService } from '@workers/services/model-pricing.service';

describe('ModelPricingService', () => {
  let service: ModelPricingService;
  let loggerService: vi.Mocked<LoggerService>;

  const mockExistingModels = [
    {
      _id: 'model-1',
      category: ModelCategory.IMAGE,
      cost: 25,
      costPerUnit: 5,
      isActive: true,
      isDeleted: false,
      key: 'google/imagen-4',
      minCost: 5,
      pricingType: PricingType.PER_MEGAPIXEL,
      provider: ModelProvider.REPLICATE,
    },
    {
      _id: 'model-2',
      category: ModelCategory.IMAGE,
      cost: 10,
      costPerUnit: 3,
      isActive: true,
      isDeleted: false,
      key: 'google/imagen-4-fast',
      minCost: 3,
      pricingType: PricingType.PER_MEGAPIXEL,
      provider: ModelProvider.REPLICATE,
    },
    {
      _id: 'model-3',
      category: ModelCategory.VIDEO,
      cost: 100,
      costPerUnit: 80,
      isActive: true,
      isDeleted: false,
      key: 'google/veo-3',
      minCost: 50,
      pricingType: PricingType.PER_SECOND,
      provider: ModelProvider.REPLICATE,
    },
    {
      _id: 'model-4',
      category: ModelCategory.IMAGE,
      cost: 50,
      costPerUnit: 8,
      isActive: true,
      isDeleted: false,
      key: 'black-forest-labs/flux-2-pro',
      minCost: 10,
      pricingType: PricingType.PER_MEGAPIXEL,
      provider: ModelProvider.REPLICATE,
    },
    {
      _id: 'model-5',
      category: ModelCategory.TEXT,
      cost: 5,
      isActive: true,
      isDeleted: false,
      key: 'meta/llama-3',
      pricingType: PricingType.FLAT,
      provider: ModelProvider.REPLICATE,
    },
  ] as unknown as ModelDocument[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelPricingService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ModelPricingService>(ModelPricingService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('estimateCost', () => {
    it('should match closest existing model for same creator', () => {
      const result = service.estimateCost(
        ModelCategory.IMAGE,
        'google',
        mockExistingModels,
      );

      // Should match google/imagen-4 (first google image model found)
      expect(result.cost).toBe(25);
      expect(result.pricingType).toBe(PricingType.PER_MEGAPIXEL);
      expect(result.costPerUnit).toBe(5);
      expect(result.minCost).toBe(5);
    });

    it('should use category average when no same-creator match', () => {
      const result = service.estimateCost(
        ModelCategory.IMAGE,
        'ideogram-ai',
        mockExistingModels,
      );

      // Should average all image models: (25 + 10 + 50) / 3 = 28.33 -> 28
      expect(result.cost).toBe(28);
      expect(result.pricingType).toBe(PricingType.PER_MEGAPIXEL);
    });

    it('should fall back to medium tier for unknown categories', () => {
      const result = service.estimateCost(
        'new-category' as ModelCategory,
        'unknown-creator',
        [],
      );

      // Should use DEFAULT_TIER_CONFIG.standard = 25
      expect(result.cost).toBe(25);
      expect(result.pricingType).toBe(PricingType.FLAT);
      expect(result.minCost).toBeGreaterThanOrEqual(2);
    });

    it('should apply minimum cost floor', () => {
      const result = service.estimateCost(
        ModelCategory.TEXT,
        'unknown-creator',
        [],
      );

      // Text standard tier = 5, minCost should be >= ABSOLUTE_MIN_COST (2)
      expect(result.minCost).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty existing models array', () => {
      const result = service.estimateCost(ModelCategory.VIDEO, 'google', []);

      // Should fall back to VIDEO standard tier = 100
      expect(result.cost).toBe(100);
      expect(result.pricingType).toBe(PricingType.PER_SECOND);
      expect(result.costPerUnit).toBe(80);
      expect(result.minCost).toBe(50);
    });

    it('should estimate video model cost correctly from tier', () => {
      const result = service.estimateCost(
        ModelCategory.VIDEO,
        'runwayml',
        mockExistingModels,
      );

      // No runwayml video models exist, so should use category average
      // Only google/veo-3 (cost=100) is a video model
      expect(result.cost).toBe(100);
    });

    it('should estimate music model cost from tier defaults', () => {
      const result = service.estimateCost(ModelCategory.MUSIC, 'meta', []);

      // Music standard tier = 20
      expect(result.cost).toBe(20);
      expect(result.pricingType).toBe(PricingType.PER_SECOND);
    });

    it('should skip deleted models when matching by creator', () => {
      const modelsWithDeleted = [
        ...mockExistingModels,
        {
          _id: 'deleted-model',
          category: ModelCategory.IMAGE,
          cost: 999,
          isActive: false,
          isDeleted: true,
          key: 'ideogram-ai/deleted-model',
          pricingType: PricingType.FLAT,
          provider: ModelProvider.REPLICATE,
        },
      ] as unknown as ModelDocument[];

      const result = service.estimateCost(
        ModelCategory.IMAGE,
        'ideogram-ai',
        modelsWithDeleted,
      );

      // Should NOT match the deleted ideogram model
      // Should use category average instead
      expect(result.cost).not.toBe(999);
    });

    it('should use correct pricing type for image category', () => {
      const result = service.estimateCost(
        ModelCategory.IMAGE,
        'new-creator',
        [],
      );

      expect(result.pricingType).toBe(PricingType.PER_MEGAPIXEL);
    });

    it('should use flat pricing for text category', () => {
      const result = service.estimateCost(
        ModelCategory.TEXT,
        'new-creator',
        [],
      );

      expect(result.pricingType).toBe(PricingType.FLAT);
    });
  });

  describe('estimateFromProviderCost', () => {
    it('should convert $0.15 provider cost to 50 credits for image category', () => {
      const result = service.estimateFromProviderCost(
        0.15,
        ModelCategory.IMAGE,
      );

      expect(result.cost).toBe(50);
    });

    it('should convert $0.50 provider cost to 167 credits for video category', () => {
      const result = service.estimateFromProviderCost(0.5, ModelCategory.VIDEO);

      expect(result.cost).toBe(167);
    });

    it('should apply minimum floor of 2 credits for very low costs', () => {
      const result = service.estimateFromProviderCost(
        0.001,
        ModelCategory.IMAGE,
      );

      expect(result.cost).toBe(2);
    });

    it('should return PER_MEGAPIXEL pricing type for IMAGE category', () => {
      const result = service.estimateFromProviderCost(
        0.15,
        ModelCategory.IMAGE,
      );

      expect(result.pricingType).toBe(PricingType.PER_MEGAPIXEL);
    });

    it('should return PER_SECOND pricing type for VIDEO category', () => {
      const result = service.estimateFromProviderCost(0.5, ModelCategory.VIDEO);

      expect(result.pricingType).toBe(PricingType.PER_SECOND);
    });

    it('should return FLAT pricing type for TEXT category', () => {
      const result = service.estimateFromProviderCost(
        0.001,
        ModelCategory.TEXT,
      );

      expect(result.pricingType).toBe(PricingType.FLAT);
    });
  });

  describe('getKnownReplicateCost', () => {
    it('should return known cost for google/veo-3', () => {
      const result = service.getKnownReplicateCost('google/veo-3');

      expect(result).toBe(0.5);
    });

    it('should return known cost for black-forest-labs/flux-1.1-pro', () => {
      const result = service.getKnownReplicateCost(
        'black-forest-labs/flux-1.1-pro',
      );

      expect(result).toBe(0.04);
    });

    it('should return null for unknown model key', () => {
      const result = service.getKnownReplicateCost('unknown/model');

      expect(result).toBeNull();
    });
  });
});

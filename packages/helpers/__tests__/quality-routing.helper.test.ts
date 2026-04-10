import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory, ModelProvider, QualityTier } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import {
  DEFAULT_QUALITY_TIER,
  getQualityTierForModel,
  getQualityTierFromModel,
  getQualityTierLabel,
  isQualityTierSupportedForCategory,
  QUALITY_TIER_OPTIONS,
  resolveQualityToModel,
  resolveQualityToModelFromDb,
} from '@helpers/quality-routing.helper';

vi.mock('@genfeedai/constants', async () => {
  const actual = await vi.importActual<typeof import('@genfeedai/constants')>(
    '@genfeedai/constants',
  );
  const enums =
    await vi.importActual<typeof import('@genfeedai/enums')>(
      '@genfeedai/enums',
    );
  return {
    ...actual,
    MODEL_OUTPUT_CAPABILITIES: {
      [actual.MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO]: {
        aspectRatios: ['1:1', '16:9', '9:16'],
        category: enums.ModelCategory.IMAGE,
      },
      [actual.MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED]: {
        aspectRatios: ['1:1', '16:9', '9:16'],
        category: enums.ModelCategory.IMAGE,
      },
      [actual.MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY]: {
        aspectRatios: ['1:1', '16:9', '9:16'],
        category: enums.ModelCategory.IMAGE,
      },
      [actual.MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST]: {
        aspectRatios: ['16:9', '9:16'],
        category: enums.ModelCategory.VIDEO,
      },
      [actual.MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: {
        aspectRatios: ['16:9', '9:16'],
        category: enums.ModelCategory.VIDEO,
      },
      [actual.MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1]: {
        aspectRatios: ['16:9', '9:16'],
        category: enums.ModelCategory.VIDEO,
      },
      [actual.MODEL_KEYS.REPLICATE_META_MUSICGEN]: {
        category: enums.ModelCategory.MUSIC,
      },
    },
  };
});

vi.mock('../src/aspect-ratio.helper', () => ({
  isAspectRatioSupported: vi.fn((modelKey: string, aspectRatio: string) => {
    const supported: Record<string, string[]> = {
      [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO]: [
        '1:1',
        '16:9',
        '9:16',
      ],
      [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED]: [
        '1:1',
        '16:9',
        '9:16',
      ],
      [MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY]: [
        '1:1',
        '16:9',
        '9:16',
      ],
      [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST]: ['16:9', '9:16'],
      [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: ['16:9', '9:16'],
      [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1]: ['16:9', '9:16'],
      [MODEL_KEYS.REPLICATE_META_MUSICGEN]: [],
      'high-image': ['1:1', '16:9', '9:16'],
      'standard-image': ['1:1', '16:9', '9:16'],
      'ultra-image': ['1:1', '16:9', '9:16'],
    };
    return supported[modelKey]?.includes(aspectRatio) ?? false;
  }),
}));

vi.mock('../src/model-capability.helper', () => ({
  getModelCapability: vi.fn(() => ({
    aspectRatios: ['1:1', '16:9', '9:16'],
    category: ModelCategory.IMAGE,
    isBatchSupported: false,
    maxOutputs: 4,
    maxReferences: 1,
  })),
}));

describe('quality-routing.helper', () => {
  describe('QUALITY_TIER_OPTIONS', () => {
    it('should have 3 quality tiers', () => {
      expect(QUALITY_TIER_OPTIONS).toHaveLength(3);
    });

    it('should have standard, premium, and ultra tiers', () => {
      const values = QUALITY_TIER_OPTIONS.map((o) => o.value);
      expect(values).toContain(QualityTier.STANDARD);
      expect(values).toContain(QualityTier.HIGH);
      expect(values).toContain(QualityTier.ULTRA);
    });

    it('should have labels and descriptions for all tiers', () => {
      for (const option of QUALITY_TIER_OPTIONS) {
        expect(option.label).toBeDefined();
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.description).toBeDefined();
        expect(option.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('DEFAULT_QUALITY_TIER', () => {
    it('should be PREMIUM', () => {
      expect(DEFAULT_QUALITY_TIER).toBe(QualityTier.HIGH);
    });
  });

  describe('resolveQualityToModel', () => {
    const imageModels = [
      MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
      MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
      MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
    ];

    const videoModels = [
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    ];

    it('should return standard image model for standard quality', () => {
      const result = resolveQualityToModel(
        QualityTier.STANDARD,
        ModelCategory.IMAGE,
        'landscape',
        imageModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO);
    });

    it('should return premium image model for premium quality', () => {
      const result = resolveQualityToModel(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        imageModels,
      );
      expect(result).toBe(
        MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
      );
    });

    it('should return ultra image model for ultra quality', () => {
      const result = resolveQualityToModel(
        QualityTier.ULTRA,
        ModelCategory.IMAGE,
        'landscape',
        imageModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY);
    });

    it('should return standard video model for standard quality', () => {
      const result = resolveQualityToModel(
        QualityTier.STANDARD,
        ModelCategory.VIDEO,
        'landscape',
        videoModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST);
    });

    it('should return premium video model for premium quality', () => {
      const result = resolveQualityToModel(
        QualityTier.HIGH,
        ModelCategory.VIDEO,
        'landscape',
        videoModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3);
    });

    it('should return ultra video model for ultra quality', () => {
      const result = resolveQualityToModel(
        QualityTier.ULTRA,
        ModelCategory.VIDEO,
        'landscape',
        videoModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1);
    });

    it('should fallback to lower tier when requested tier not available', () => {
      const limitedModels = [
        MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
      ];
      const result = resolveQualityToModel(
        QualityTier.ULTRA,
        ModelCategory.IMAGE,
        'landscape',
        limitedModels,
      );
      expect(result).toBe(MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO);
    });

    it('should return null for unsupported categories', () => {
      const result = resolveQualityToModel(
        QualityTier.HIGH,
        ModelCategory.TEXT,
        'landscape',
        imageModels,
      );
      expect(result).toBeNull();
    });

    it('should return null when no models available', () => {
      const result = resolveQualityToModel(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        [],
      );
      expect(result).toBeNull();
    });
  });

  describe('getQualityTierForModel', () => {
    it('should return STANDARD for standard tier models', () => {
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO,
          ModelCategory.IMAGE,
        ),
      ).toBe(QualityTier.STANDARD);
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
          ModelCategory.VIDEO,
        ),
      ).toBe(QualityTier.STANDARD);
    });

    it('should return PREMIUM for premium tier models', () => {
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED,
          ModelCategory.IMAGE,
        ),
      ).toBe(QualityTier.HIGH);
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          ModelCategory.VIDEO,
        ),
      ).toBe(QualityTier.HIGH);
    });

    it('should return ULTRA for ultra tier models', () => {
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY,
          ModelCategory.IMAGE,
        ),
      ).toBe(QualityTier.ULTRA);
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
          ModelCategory.VIDEO,
        ),
      ).toBe(QualityTier.ULTRA);
    });

    it('should return DEFAULT_QUALITY_TIER for unknown models', () => {
      expect(getQualityTierForModel('unknown-model', ModelCategory.IMAGE)).toBe(
        DEFAULT_QUALITY_TIER,
      );
    });

    it('should return DEFAULT_QUALITY_TIER for unsupported categories', () => {
      expect(
        getQualityTierForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          ModelCategory.TEXT,
        ),
      ).toBe(DEFAULT_QUALITY_TIER);
    });
  });

  describe('getQualityTierLabel', () => {
    it('should return Standard for STANDARD tier', () => {
      expect(getQualityTierLabel(QualityTier.STANDARD)).toBe('Standard');
    });

    it('should return Premium for PREMIUM tier', () => {
      expect(getQualityTierLabel(QualityTier.HIGH)).toBe('Premium');
    });

    it('should return Ultra for ULTRA tier', () => {
      expect(getQualityTierLabel(QualityTier.ULTRA)).toBe('Ultra');
    });

    it('should return Premium for unknown tier', () => {
      expect(getQualityTierLabel('unknown' as QualityTier)).toBe('Premium');
    });
  });

  describe('isQualityTierSupportedForCategory', () => {
    it('should return true for IMAGE category', () => {
      expect(isQualityTierSupportedForCategory(ModelCategory.IMAGE)).toBe(true);
    });

    it('should return true for VIDEO category', () => {
      expect(isQualityTierSupportedForCategory(ModelCategory.VIDEO)).toBe(true);
    });

    it('should return true for MUSIC category', () => {
      expect(isQualityTierSupportedForCategory(ModelCategory.MUSIC)).toBe(true);
    });

    it('should return false for TEXT category', () => {
      expect(isQualityTierSupportedForCategory(ModelCategory.TEXT)).toBe(false);
    });

    it('should return false for EMBEDDING category', () => {
      expect(isQualityTierSupportedForCategory(ModelCategory.EMBEDDING)).toBe(
        false,
      );
    });

    it('should return false for IMAGE_UPSCALE category', () => {
      expect(
        isQualityTierSupportedForCategory(ModelCategory.IMAGE_UPSCALE),
      ).toBe(false);
    });

    it('should return false for VIDEO_UPSCALE category', () => {
      expect(
        isQualityTierSupportedForCategory(ModelCategory.VIDEO_UPSCALE),
      ).toBe(false);
    });
  });

  // ==========================================================================
  // DB-backed quality resolution tests
  // ==========================================================================

  function createMockModel(overrides: Partial<IModel> = {}): IModel {
    return {
      category: ModelCategory.IMAGE,
      cost: 10,
      createdAt: '2025-01-01T00:00:00.000Z',
      id: 'test-model-id',
      isActive: true,
      isDefault: false,
      isDeleted: false,
      key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
      label: 'Test Model',
      provider: ModelProvider.REPLICATE,
      updatedAt: '2025-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  describe('resolveQualityToModelFromDb', () => {
    it('should return model matching quality tier and format', () => {
      const models = [
        createMockModel({
          id: 'standard',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
        createMockModel({
          id: 'high',
          key: 'high-image' as string,
          qualityTier: QualityTier.HIGH,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('high');
    });

    it('should fall back to lower tier when requested tier unavailable', () => {
      const models = [
        createMockModel({
          id: 'standard',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.ULTRA,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('standard');
    });

    it('should skip inactive models', () => {
      const models = [
        createMockModel({
          id: 'inactive',
          isActive: false,
          key: 'high-image' as string,
          qualityTier: QualityTier.HIGH,
        }),
        createMockModel({
          id: 'active-standard',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('active-standard');
    });

    it('should skip deleted models', () => {
      const models = [
        createMockModel({
          id: 'deleted',
          isDeleted: true,
          key: 'high-image' as string,
          qualityTier: QualityTier.HIGH,
        }),
        createMockModel({
          id: 'active-standard',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('active-standard');
    });

    it('should filter by category', () => {
      const models = [
        createMockModel({
          category: ModelCategory.VIDEO,
          id: 'video-model',
          key: 'high-image' as string,
          qualityTier: QualityTier.HIGH,
        }),
        createMockModel({
          category: ModelCategory.IMAGE,
          id: 'image-model',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('image-model');
    });

    it('should return null when no models match', () => {
      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        [],
      );

      expect(result).toBeNull();
    });

    it('should return any compatible model when no tier matches', () => {
      const models = [
        createMockModel({
          id: 'no-tier',
          key: 'standard-image' as string,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.ULTRA,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('no-tier');
    });

    it('should prefer exact tier match over fallback', () => {
      const models = [
        createMockModel({
          id: 'standard',
          key: 'standard-image' as string,
          qualityTier: QualityTier.STANDARD,
        }),
        createMockModel({
          id: 'high',
          key: 'high-image' as string,
          qualityTier: QualityTier.HIGH,
        }),
        createMockModel({
          id: 'ultra',
          key: 'ultra-image' as string,
          qualityTier: QualityTier.ULTRA,
        }),
      ];

      const result = resolveQualityToModelFromDb(
        QualityTier.HIGH,
        ModelCategory.IMAGE,
        'landscape',
        models,
      );

      expect(result).not.toBeNull();
      expect(result?.id).toBe('high');
    });
  });

  describe('getQualityTierFromModel', () => {
    it('should return qualityTier from model document', () => {
      const model = createMockModel({ qualityTier: QualityTier.ULTRA });

      expect(getQualityTierFromModel(model)).toBe(QualityTier.ULTRA);
    });

    it('should return DEFAULT_QUALITY_TIER when qualityTier is not set', () => {
      const model = createMockModel();

      expect(getQualityTierFromModel(model)).toBe(DEFAULT_QUALITY_TIER);
    });
  });
});

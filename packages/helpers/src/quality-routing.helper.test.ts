import { ModelCategory, QualityTier } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  DEFAULT_QUALITY_TIER,
  getQualityTierForModel,
  getQualityTierLabel,
  QUALITY_TIER_OPTIONS,
} from '@helpers/quality-routing.helper';

vi.mock('@genfeedai/contracts/constants', async () => {
  const [actual, enums] = await Promise.all([
    vi.importActual<typeof import('@genfeedai/contracts/constants')>(
      '@genfeedai/contracts/constants',
    ),
    vi.importActual<typeof import('@genfeedai/contracts')>(
      '@genfeedai/contracts',
    ),
  ]);
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
});

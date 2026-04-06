import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import {
  calculateAspectRatio,
  convertRatioToOrientation,
  getAspectRatiosForModel,
  getDefaultAspectRatio,
  isAspectRatioSupported,
  normalizeAspectRatioForModel,
} from '@helpers/aspect-ratio.helper';

vi.mock('@genfeedai/constants', () => ({
  MODEL_OUTPUT_CAPABILITIES: {
    [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: {
      aspectRatios: ['16:9', '9:16', '1:1'],
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      usesOrientation: false,
    },
    [MODEL_KEYS.REPLICATE_OPENAI_SORA_2]: {
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      usesOrientation: true,
    },
    [MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3]: {
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
    },
    [MODEL_KEYS.REPLICATE_META_MUSICGEN]: {
      category: ModelCategory.MUSIC,
    },
    [MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1]: {
      category: ModelCategory.TEXT,
    },
    [MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE]: {
      category: ModelCategory.IMAGE_UPSCALE,
    },
  },
}));

describe('aspect-ratio.helper', () => {
  describe('getDefaultAspectRatio', () => {
    it('should return model-specific default for video models', () => {
      expect(getDefaultAspectRatio(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3)).toBe(
        '16:9',
      );
    });

    it('should return model-specific default for image models', () => {
      expect(getDefaultAspectRatio(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3)).toBe(
        '1:1',
      );
    });

    it('should return 16:9 for unknown models', () => {
      expect(getDefaultAspectRatio('unknown-model')).toBe('16:9');
    });

    it('should return 16:9 for categories without aspect ratio', () => {
      expect(getDefaultAspectRatio(MODEL_KEYS.REPLICATE_META_MUSICGEN)).toBe(
        '16:9',
      );
      expect(
        getDefaultAspectRatio(MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1),
      ).toBe('16:9');
    });
  });

  describe('getAspectRatiosForModel', () => {
    it('should return available aspect ratios for video models', () => {
      const ratios = getAspectRatiosForModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3);
      expect(ratios).toEqual(['16:9', '9:16', '1:1']);
    });

    it('should return available aspect ratios for image models', () => {
      const ratios = getAspectRatiosForModel(
        MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
      );
      expect(ratios).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4']);
    });

    it('should return empty array for categories without aspect ratio', () => {
      expect(
        getAspectRatiosForModel(MODEL_KEYS.REPLICATE_META_MUSICGEN),
      ).toEqual([]);
      expect(
        getAspectRatiosForModel(MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE),
      ).toEqual([]);
    });

    it('should return fallback ratios for unknown models', () => {
      const ratios = getAspectRatiosForModel('unknown-model');
      expect(ratios).toEqual(['1:1', '9:16', '16:9']);
    });
  });

  describe('normalizeAspectRatioForModel', () => {
    it('should return same ratio if supported', () => {
      expect(
        normalizeAspectRatioForModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '16:9'),
      ).toBe('16:9');
      expect(
        normalizeAspectRatioForModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '9:16'),
      ).toBe('9:16');
    });

    it('should return default ratio if not supported and no orientation mode', () => {
      expect(
        normalizeAspectRatioForModel(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '4:3'),
      ).toBe('16:9');
    });

    it('should convert to orientation for models that use orientation mode', () => {
      expect(
        normalizeAspectRatioForModel(MODEL_KEYS.REPLICATE_OPENAI_SORA_2, '4:3'),
      ).toBe('landscape');
      expect(
        normalizeAspectRatioForModel(MODEL_KEYS.REPLICATE_OPENAI_SORA_2, '3:4'),
      ).toBe('portrait');
    });
  });

  describe('calculateAspectRatio', () => {
    it('should return 16:9 for null/undefined dimensions', () => {
      expect(calculateAspectRatio(undefined, undefined)).toBe('16:9');
      expect(calculateAspectRatio(0, 0)).toBe('16:9');
      expect(calculateAspectRatio(100, undefined)).toBe('16:9');
    });

    it('should calculate 16:9 landscape ratio', () => {
      expect(calculateAspectRatio(1920, 1080)).toBe('16:9');
      expect(calculateAspectRatio(1280, 720)).toBe('16:9');
    });

    it('should calculate 9:16 portrait ratio', () => {
      expect(calculateAspectRatio(1080, 1920)).toBe('9:16');
      expect(calculateAspectRatio(720, 1280)).toBe('9:16');
    });

    it('should calculate 1:1 square ratio', () => {
      expect(calculateAspectRatio(1080, 1080)).toBe('1:1');
      expect(calculateAspectRatio(500, 500)).toBe('1:1');
    });

    it('should calculate 4:3 ratio', () => {
      expect(calculateAspectRatio(1024, 768)).toBe('4:3');
      expect(calculateAspectRatio(800, 600)).toBe('4:3');
    });

    it('should calculate 3:4 portrait ratio', () => {
      expect(calculateAspectRatio(768, 1024)).toBe('3:4');
    });

    it('should calculate 21:9 ultrawide ratio', () => {
      expect(calculateAspectRatio(2560, 1080)).toBe('21:9');
    });

    it('should fallback to 16:9 for landscape unknown ratios', () => {
      expect(calculateAspectRatio(1700, 1000)).toBe('16:9');
    });

    it('should fallback to 9:16 for portrait unknown ratios', () => {
      expect(calculateAspectRatio(1000, 1700)).toBe('9:16');
    });
  });

  describe('isAspectRatioSupported', () => {
    it('should return true for supported ratios', () => {
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '16:9'),
      ).toBe(true);
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '9:16'),
      ).toBe(true);
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '1:1'),
      ).toBe(true);
    });

    it('should return false for unsupported ratios', () => {
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '4:3'),
      ).toBe(false);
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, '21:9'),
      ).toBe(false);
    });

    it('should return false for models without aspect ratios', () => {
      expect(
        isAspectRatioSupported(MODEL_KEYS.REPLICATE_META_MUSICGEN, '16:9'),
      ).toBe(false);
    });
  });

  describe('convertRatioToOrientation', () => {
    it('should return portrait for portrait ratios', () => {
      expect(convertRatioToOrientation('9:16')).toBe('portrait');
      expect(convertRatioToOrientation('3:4')).toBe('portrait');
      expect(convertRatioToOrientation('2:3')).toBe('portrait');
      expect(convertRatioToOrientation('1:2')).toBe('portrait');
    });

    it('should return landscape for landscape and square ratios', () => {
      expect(convertRatioToOrientation('16:9')).toBe('landscape');
      expect(convertRatioToOrientation('4:3')).toBe('landscape');
      expect(convertRatioToOrientation('1:1')).toBe('landscape');
      expect(convertRatioToOrientation('21:9')).toBe('landscape');
    });

    it('should return landscape for unknown ratios', () => {
      expect(convertRatioToOrientation('unknown')).toBe('landscape');
    });
  });
});

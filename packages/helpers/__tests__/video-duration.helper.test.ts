import { MODEL_KEYS } from '@genfeedai/constants';
import { DurationUtil, formatDuration } from '@helpers/video-duration.helper';

vi.mock('@genfeedai/constants', () => ({
  getModelDefaultDuration: vi.fn((model: string) => {
    const defaults: Record<string, number> = {
      [MODEL_KEYS.REPLICATE_OPENAI_SORA_2]: 4,
      [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: 8,
      [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1]: 5,
    };
    return defaults[model] || 8;
  }),
  getModelDurations: vi.fn((model: string) => {
    const durations: Record<string, number[]> = {
      [MODEL_KEYS.REPLICATE_OPENAI_SORA_2]: [4, 8, 12],
      [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: [5, 8],
      [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1]: [5, 10],
    };
    return durations[model] || [];
  }),
}));

describe('video-duration.helper', () => {
  describe('formatDuration', () => {
    it('should return 0:00 for null/undefined', () => {
      expect(formatDuration(null)).toBe('0:00');
      expect(formatDuration(undefined)).toBe('0:00');
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should format seconds only (MM:SS)', () => {
      expect(formatDuration(5)).toBe('0:05');
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(59)).toBe('0:59');
    });

    it('should format minutes and seconds (MM:SS)', () => {
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(125)).toBe('2:05');
      expect(formatDuration(3599)).toBe('59:59');
    });

    it('should format hours, minutes, and seconds (HH:MM:SS)', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3661)).toBe('1:01:01');
      expect(formatDuration(7325)).toBe('2:02:05');
      expect(formatDuration(36000)).toBe('10:00:00');
    });

    it('should pad minutes and seconds with zeros', () => {
      expect(formatDuration(61)).toBe('1:01');
      expect(formatDuration(3601)).toBe('1:00:01');
      expect(formatDuration(3660)).toBe('1:01:00');
    });
  });

  describe('DurationUtil.validateAndNormalize', () => {
    it('should return default duration if requested is undefined', () => {
      expect(DurationUtil.validateAndNormalize(undefined, [4, 8, 12], 8)).toBe(
        8,
      );
    });

    it('should return first allowed duration if no default and no request', () => {
      expect(DurationUtil.validateAndNormalize(undefined, [4, 8, 12])).toBe(4);
    });

    it('should return requested duration if it matches allowed', () => {
      expect(DurationUtil.validateAndNormalize(8, [4, 8, 12])).toBe(8);
      expect(DurationUtil.validateAndNormalize(4, [4, 8, 12])).toBe(4);
      expect(DurationUtil.validateAndNormalize(12, [4, 8, 12])).toBe(12);
    });

    it('should return nearest allowed duration if requested is not allowed', () => {
      expect(DurationUtil.validateAndNormalize(5, [4, 8, 12])).toBe(4);
      expect(DurationUtil.validateAndNormalize(7, [4, 8, 12])).toBe(8);
      expect(DurationUtil.validateAndNormalize(10, [4, 8, 12])).toBe(8);
      expect(DurationUtil.validateAndNormalize(11, [4, 8, 12])).toBe(12);
      expect(DurationUtil.validateAndNormalize(15, [4, 8, 12])).toBe(12);
    });

    it('should handle single allowed duration', () => {
      expect(DurationUtil.validateAndNormalize(10, [5])).toBe(5);
      expect(DurationUtil.validateAndNormalize(undefined, [5])).toBe(5);
    });

    it('should handle edge case - equidistant values', () => {
      // When equidistant, reduce picks the one that came first in iteration
      expect(DurationUtil.validateAndNormalize(6, [4, 8])).toBe(4);
    });
  });

  describe('DurationUtil.validateSoraDuration', () => {
    it('should return default 4 if no duration requested', () => {
      expect(DurationUtil.validateSoraDuration()).toBe(4);
      expect(DurationUtil.validateSoraDuration(undefined)).toBe(4);
    });

    it('should return valid Sora durations [4, 8, 12]', () => {
      expect(DurationUtil.validateSoraDuration(4)).toBe(4);
      expect(DurationUtil.validateSoraDuration(8)).toBe(8);
      expect(DurationUtil.validateSoraDuration(12)).toBe(12);
    });

    it('should normalize invalid durations to nearest Sora duration', () => {
      expect(DurationUtil.validateSoraDuration(5)).toBe(4);
      expect(DurationUtil.validateSoraDuration(7)).toBe(8);
      expect(DurationUtil.validateSoraDuration(10)).toBe(8);
      expect(DurationUtil.validateSoraDuration(15)).toBe(12);
    });
  });

  describe('DurationUtil.validateVeoDuration', () => {
    it('should return default 8 if no duration requested', () => {
      expect(DurationUtil.validateVeoDuration()).toBe(8);
      expect(DurationUtil.validateVeoDuration(undefined)).toBe(8);
    });

    it('should return valid Veo durations [5, 8]', () => {
      expect(DurationUtil.validateVeoDuration(5)).toBe(5);
      expect(DurationUtil.validateVeoDuration(8)).toBe(8);
    });

    it('should normalize invalid durations to nearest Veo duration', () => {
      expect(DurationUtil.validateVeoDuration(4)).toBe(5);
      expect(DurationUtil.validateVeoDuration(6)).toBe(5);
      expect(DurationUtil.validateVeoDuration(7)).toBe(8);
      expect(DurationUtil.validateVeoDuration(10)).toBe(8);
    });

    it('should accept custom allowed durations and default', () => {
      expect(DurationUtil.validateVeoDuration(undefined, [4, 8, 12], 4)).toBe(
        4,
      );
      expect(DurationUtil.validateVeoDuration(10, [4, 8, 12], 4)).toBe(8);
    });
  });

  describe('DurationUtil.validateDurationForModel', () => {
    it('should validate duration for Sora model', () => {
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
          4,
        ),
      ).toBe(4);
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
          8,
        ),
      ).toBe(8);
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
          5,
        ),
      ).toBe(4);
    });

    it('should validate duration for Veo model', () => {
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          5,
        ),
      ).toBe(5);
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          8,
        ),
      ).toBe(8);
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          6,
        ),
      ).toBe(5);
    });

    it('should return default duration for model when not specified', () => {
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_OPENAI_SORA_2,
        ),
      ).toBe(4);
      expect(
        DurationUtil.validateDurationForModel(
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
        ),
      ).toBe(8);
    });

    it('should handle unknown models with no durations', () => {
      expect(
        DurationUtil.validateDurationForModel('unknown-model' as string, 10),
      ).toBe(10);
      expect(
        DurationUtil.validateDurationForModel('unknown-model' as string),
      ).toBe(8);
    });
  });
});

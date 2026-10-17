import { describe, expect, it } from 'vitest';
import { MODEL_KEYS } from '.';
import {
  getModelDefaultDuration,
  getModelDurationLimits,
  getModelDurations,
  getModelDurationsForResolution,
  getModelMaxOutputs,
  getModelMaxReferences,
  getModelMaxVideoReferences,
  getModelMinDuration,
  hasAnyAudioToggle,
  hasAnyEndFrame,
  hasAnyImagenModel,
  hasAnyInterpolation,
  hasAnyResolutionOptions,
  hasAnySpeech,
  hasAudioToggle,
  hasDurationEditing,
  hasEndFrame,
  hasInterpolation,
  hasModelWithoutDurationEditing,
  hasNativeExtend,
  hasResolutionOptions,
  hasSpeech,
  hasVideoReferences,
  isImagenModel,
  isOnlyImagenModels,
  isReferencesMandatory,
  narrowDurationsByResolution,
  requiresFirstFrame,
  supportsMultipleOutputs,
  supportsMultipleReferences,
} from './model-helpers.constant';

const UNKNOWN = 'unknown/model';

describe('model-helpers.constant', () => {
  describe('getModelMaxOutputs', () => {
    it('returns 4 for unknown model', () => {
      expect(getModelMaxOutputs(UNKNOWN)).toBe(4);
    });

    it('returns number for known model', () => {
      const result = getModelMaxOutputs(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('supportsMultipleOutputs', () => {
    it('returns true for unknown (defaults to 4)', () => {
      expect(supportsMultipleOutputs(UNKNOWN)).toBe(true);
    });
  });

  describe('getModelMaxReferences', () => {
    it('returns 1 for unknown model', () => {
      expect(getModelMaxReferences(UNKNOWN)).toBe(1);
    });
  });

  describe('supportsMultipleReferences', () => {
    it('returns false for unknown (defaults to 1)', () => {
      expect(supportsMultipleReferences(UNKNOWN)).toBe(false);
    });
  });

  describe('getModelMaxVideoReferences', () => {
    it('uses the video field cap rather than the generic image-reference cap', () => {
      expect(
        getModelMaxVideoReferences(
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
        ),
      ).toBe(1);
      expect(
        getModelMaxVideoReferences(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
      ).toBe(10);
      expect(getModelMaxVideoReferences(MODEL_KEYS.REPLICATE_MINIMAX_H3)).toBe(
        3,
      );
      expect(
        getModelMaxVideoReferences(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3),
      ).toBe(0);
    });
  });

  describe('isReferencesMandatory', () => {
    it('returns false for unknown model', () => {
      expect(isReferencesMandatory(UNKNOWN)).toBe(false);
    });
  });

  describe('hasEndFrame', () => {
    it('returns false for unknown model', () => {
      expect(hasEndFrame(UNKNOWN)).toBe(false);
    });
  });

  describe('hasNativeExtend', () => {
    it('advertises only the documented Seedance extension route', () => {
      expect(hasNativeExtend(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5)).toBe(
        true,
      );
      expect(hasNativeExtend(MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1)).toBe(false);
      expect(hasNativeExtend(UNKNOWN)).toBe(false);
    });
  });

  describe('requiresFirstFrame', () => {
    it('blocks Hailuo Fast without changing text-to-video models', () => {
      expect(
        requiresFirstFrame(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST),
      ).toBe(true);
      expect(requiresFirstFrame(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3)).toBe(
        false,
      );
    });

    it('requires a source still for every Higgsfield DoP tier', () => {
      expect(requiresFirstFrame(MODEL_KEYS.HIGGSFIELD_DOP_LITE)).toBe(true);
      expect(requiresFirstFrame(MODEL_KEYS.HIGGSFIELD_DOP_TURBO)).toBe(true);
      expect(requiresFirstFrame(MODEL_KEYS.HIGGSFIELD_DOP_STANDARD)).toBe(true);
    });

    it('requires a character still and one source clip for Genjutsu', () => {
      expect(requiresFirstFrame(MODEL_KEYS.HIGGSFIELD_GENJUTSU)).toBe(true);
      expect(hasVideoReferences(MODEL_KEYS.HIGGSFIELD_GENJUTSU)).toBe(true);
      expect(getModelMaxVideoReferences(MODEL_KEYS.HIGGSFIELD_GENJUTSU)).toBe(
        1,
      );
      expect(hasDurationEditing(MODEL_KEYS.HIGGSFIELD_GENJUTSU)).toBe(false);
    });
  });

  describe('HeyGen Video', () => {
    it('accepts speech, duration, and up to three reference clips', () => {
      expect(hasSpeech(MODEL_KEYS.HEYGEN_VIDEO)).toBe(true);
      expect(hasVideoReferences(MODEL_KEYS.HEYGEN_VIDEO)).toBe(true);
      expect(getModelMaxVideoReferences(MODEL_KEYS.HEYGEN_VIDEO)).toBe(3);
      expect(requiresFirstFrame(MODEL_KEYS.HEYGEN_VIDEO)).toBe(false);
    });
  });

  describe('hasSpeech', () => {
    it('returns false for unknown model', () => {
      expect(hasSpeech(UNKNOWN)).toBe(false);
    });
  });

  describe('hasAudioToggle', () => {
    it('returns false for unknown model', () => {
      expect(hasAudioToggle(UNKNOWN)).toBe(false);
    });
  });

  describe('hasDurationEditing', () => {
    it('returns true for unknown model (default)', () => {
      expect(hasDurationEditing(UNKNOWN)).toBe(true);
    });
  });

  describe('hasResolutionOptions', () => {
    it('returns false for unknown model', () => {
      expect(hasResolutionOptions(UNKNOWN)).toBe(false);
    });
  });

  describe('isImagenModel', () => {
    it('returns false for unknown model', () => {
      expect(isImagenModel(UNKNOWN)).toBe(false);
    });

    it('returns true for Imagen 3', () => {
      expect(isImagenModel(MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3)).toBe(true);
    });
  });

  describe('hasInterpolation', () => {
    it('returns false for unknown model', () => {
      expect(hasInterpolation(UNKNOWN)).toBe(false);
    });
  });

  describe('hasAnyEndFrame', () => {
    it('returns false for empty array', () => {
      expect(hasAnyEndFrame([])).toBe(false);
    });

    it('returns false for unknown models', () => {
      expect(hasAnyEndFrame([UNKNOWN])).toBe(false);
    });
  });

  describe('hasAnyInterpolation', () => {
    it('returns false for empty array', () => {
      expect(hasAnyInterpolation([])).toBe(false);
    });
  });

  describe('hasAnySpeech', () => {
    it('returns false for empty array', () => {
      expect(hasAnySpeech([])).toBe(false);
    });
  });

  describe('hasAnyAudioToggle', () => {
    it('returns false for empty array', () => {
      expect(hasAnyAudioToggle([])).toBe(false);
    });
  });

  describe('hasAnyResolutionOptions', () => {
    it('returns false for empty array', () => {
      expect(hasAnyResolutionOptions([])).toBe(false);
    });
  });

  describe('hasAnyImagenModel', () => {
    it('returns false for empty array', () => {
      expect(hasAnyImagenModel([])).toBe(false);
    });

    it('returns true when Imagen model present', () => {
      expect(
        hasAnyImagenModel([UNKNOWN, MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3]),
      ).toBe(true);
    });
  });

  describe('isOnlyImagenModels', () => {
    it('returns false for empty array', () => {
      expect(isOnlyImagenModels([])).toBe(false);
    });

    it('returns false when mixed models', () => {
      expect(
        isOnlyImagenModels([UNKNOWN, MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3]),
      ).toBe(false);
    });

    it('returns true when all Imagen', () => {
      expect(
        isOnlyImagenModels([
          MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
          MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3_FAST,
        ]),
      ).toBe(true);
    });
  });

  describe('hasModelWithoutDurationEditing', () => {
    it('returns false for unknown models (default true)', () => {
      expect(hasModelWithoutDurationEditing([UNKNOWN])).toBe(false);
    });
  });

  describe('getModelDurations', () => {
    it('returns empty for unknown model', () => {
      expect(getModelDurations(UNKNOWN)).toEqual([]);
    });
  });

  describe('getModelDefaultDuration', () => {
    it('returns undefined for unknown model', () => {
      expect(getModelDefaultDuration(UNKNOWN)).toBeUndefined();
    });
  });

  describe('getModelMinDuration', () => {
    it('returns undefined for unknown model', () => {
      expect(getModelMinDuration(UNKNOWN)).toBeUndefined();
    });
  });

  describe('getModelDurationsForResolution', () => {
    it('caps Hailuo 1080p at the 6 s Replicate allows', () => {
      expect(
        getModelDurationsForResolution(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          '1080p',
        ),
      ).toEqual([6]);
      expect(
        getModelDurationsForResolution(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
          '1080p',
        ),
      ).toEqual([6]);
    });

    it('offers every duration at an uncapped or unspecified resolution', () => {
      expect(
        getModelDurationsForResolution(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          '768p',
        ),
      ).toEqual([6, 10]);
      expect(
        getModelDurationsForResolution(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
        ),
      ).toEqual([6, 10]);
    });

    it('returns empty for unknown model', () => {
      expect(getModelDurationsForResolution(UNKNOWN, '1080p')).toEqual([]);
    });

    it('lets limits read from the provider contract replace the static cap', () => {
      expect(
        getModelDurationsForResolution(
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          '1080p',
          null,
          { '1080P': [6, 10] },
        ),
      ).toEqual([6, 10]);
    });
  });

  describe('getModelDurationLimits', () => {
    it('merges live limits over the static capability, lowercasing keys', () => {
      expect(
        getModelDurationLimits(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST, {
          '768P': [6],
        }),
      ).toEqual({ '1080p': [6], '768p': [6] });
    });

    it('keeps live limits for a model the static table does not know', () => {
      expect(getModelDurationLimits(UNKNOWN, { '720p': [5] })).toEqual({
        '720p': [5],
      });
    });
  });

  describe('narrowDurationsByResolution', () => {
    it('applies a cap case-insensitively and ignores an uncapped resolution', () => {
      const limits = { '1080p': [6] };
      expect(narrowDurationsByResolution([6, 10], limits, '1080P')).toEqual([
        6,
      ]);
      expect(narrowDurationsByResolution([6, 10], limits, '768p')).toEqual([
        6, 10,
      ]);
      expect(narrowDurationsByResolution([6, 10], limits)).toEqual([6, 10]);
    });

    it('answers with the cap when no offered length survives it', () => {
      expect(
        narrowDurationsByResolution([5, 10], { '1080p': [6] }, '1080p'),
      ).toEqual([6]);
    });
  });
});

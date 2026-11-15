import { describe, expect, it } from 'vitest';
import { ModelCategory } from '..';
import { MODEL_KEYS } from '.';
import type {
  ImageModelCapability,
  ModelOutputCapability,
  VideoModelCapability,
} from './model-capabilities.constant';
import {
  getModelDefaultDuration,
  getModelDurationLimits,
  getModelDurations,
  getModelDurationsForResolution,
  getModelMaxAudioReferences,
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
  hasAudioReferences,
  hasAudioToggle,
  hasDurationEditing,
  hasEndFrame,
  hasInterpolation,
  hasModelWithoutDurationEditing,
  hasNativeExtend,
  hasResolutionOptions,
  hasSourceDerivedAspect,
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
  it('enables audio references only for the reviewed H3 model', () => {
    expect(hasAudioReferences(MODEL_KEYS.REPLICATE_MINIMAX_H3)).toBe(true);
    expect(getModelMaxAudioReferences(MODEL_KEYS.REPLICATE_MINIMAX_H3)).toBe(3);
    expect(hasAudioReferences(UNKNOWN)).toBe(false);
    expect(
      getModelMaxAudioReferences(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
    ).toBe(0);
  });
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

  describe('hasSourceDerivedAspect', () => {
    it('flags models whose clip follows the source image, not the picked ratio', () => {
      expect(
        hasSourceDerivedAspect(MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST),
      ).toBe(true);
    });

    it('flags only models whose dispatch sends no aspect ratio', () => {
      expect(
        hasSourceDerivedAspect(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST),
      ).toBe(true);
      expect(
        hasSourceDerivedAspect(MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3),
      ).toBe(false);
      expect(
        hasSourceDerivedAspect(MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5),
      ).toBe(false);
      expect(hasSourceDerivedAspect(UNKNOWN)).toBe(false);
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

const IMAGEN_4_KEY = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
const VEO_2_KEY = MODEL_KEYS.REPLICATE_GOOGLE_VEO_2;
const MUSICGEN_KEY = MODEL_KEYS.REPLICATE_META_MUSICGEN;

describe('getModelMaxOutputs', () => {
  it('should return correct value from constant', () => {
    const result = getModelMaxOutputs(IMAGEN_4_KEY);

    expect(result).toBe(4);
  });

  it('should use provided capability instead of constant', () => {
    const customCapability: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 10,
      maxReferences: 1,
    };

    const result = getModelMaxOutputs(IMAGEN_4_KEY, customCapability);

    expect(result).toBe(10);
  });

  it('should return default of 4 when no capability found', () => {
    const result = getModelMaxOutputs('nonexistent/model');

    expect(result).toBe(4);
  });

  it('should accept null capability and fall back to constant', () => {
    const result = getModelMaxOutputs(IMAGEN_4_KEY, null);

    expect(result).toBe(4);
  });
});

describe('supportsMultipleOutputs', () => {
  it('should return true when maxOutputs > 1', () => {
    expect(supportsMultipleOutputs(IMAGEN_4_KEY)).toBe(true);
  });

  it('should return false when maxOutputs is 1', () => {
    const singleOutputCap: ModelOutputCapability = {
      category: ModelCategory.IMAGE_UPSCALE,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 1,
    };

    expect(supportsMultipleOutputs('upscale/model', singleOutputCap)).toBe(
      false,
    );
  });
});

describe('getModelMaxReferences', () => {
  it('should return correct value from constant (backward compat)', () => {
    const result = getModelMaxReferences(IMAGEN_4_KEY);

    expect(result).toBe(1);
  });

  it('should use provided capability', () => {
    const customCapability: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 20,
    };

    const result = getModelMaxReferences(IMAGEN_4_KEY, customCapability);

    expect(result).toBe(20);
  });

  it('should return default of 1 when no capability found', () => {
    const result = getModelMaxReferences('nonexistent/model');

    expect(result).toBe(1);
  });
});

describe('hasSpeech', () => {
  it('should return true for video model with speech (backward compat)', () => {
    const result = hasSpeech(VEO_2_KEY);

    expect(result).toBe(true);
  });

  it('should use provided capability for video model', () => {
    const videoCapWithSpeech: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = hasSpeech('custom/video', videoCapWithSpeech);

    expect(result).toBe(true);
  });

  it('should return false for video model without speech', () => {
    const videoCapNoSpeech: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      hasSpeech: false,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = hasSpeech('custom/video', videoCapNoSpeech);

    expect(result).toBe(false);
  });

  it('should return false for non-video category', () => {
    const imageCap: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = hasSpeech(IMAGEN_4_KEY, imageCap);

    expect(result).toBe(false);
  });

  it('should return false when no capability found', () => {
    const result = hasSpeech('nonexistent/model');

    expect(result).toBe(false);
  });
});

describe('isImagenModel', () => {
  it('should return true for imagen model (backward compat)', () => {
    const result = isImagenModel(IMAGEN_4_KEY);

    expect(result).toBe(true);
  });

  it('should use provided capability', () => {
    const imagenCap: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      isImagenModel: true,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = isImagenModel('custom/image', imagenCap);

    expect(result).toBe(true);
  });

  it('should return false when isImagenModel is not set', () => {
    const nonImagenCap: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = isImagenModel('custom/image', nonImagenCap);

    expect(result).toBe(false);
  });

  it('should return false for non-image category', () => {
    const videoCap: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = isImagenModel(VEO_2_KEY, videoCap);

    expect(result).toBe(false);
  });

  it('should return false when no capability found', () => {
    const result = isImagenModel('nonexistent/model');

    expect(result).toBe(false);
  });
});

describe('getModelDurations', () => {
  it('should return correct durations from constant (backward compat)', () => {
    const result = getModelDurations(VEO_2_KEY);

    expect(result).toEqual([5, 6, 7, 8]);
  });

  it('should use provided capability', () => {
    const customVideoCap: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      defaultDuration: 6,
      durations: [3, 6, 9, 12],
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getModelDurations('custom/video', customVideoCap);

    expect(result).toEqual([3, 6, 9, 12]);
  });

  it('should return empty array for image models', () => {
    const result = getModelDurations(IMAGEN_4_KEY);

    expect(result).toEqual([]);
  });

  it('should return empty array when no capability found', () => {
    const result = getModelDurations('nonexistent/model');

    expect(result).toEqual([]);
  });

  it('should return durations for music models', () => {
    const result = getModelDurations(MUSICGEN_KEY);

    expect(result).toEqual([5, 10, 15, 30]);
  });

  it('should return empty array for text category via capability', () => {
    const textCap: ModelOutputCapability = {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    };

    const result = getModelDurations('text/model', textCap);

    expect(result).toEqual([]);
  });
});

describe('getModelDefaultDuration', () => {
  it('should return correct default duration from constant', () => {
    const result = getModelDefaultDuration(VEO_2_KEY);

    expect(result).toBe(5);
  });

  it('should use provided capability', () => {
    const customCap: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      defaultDuration: 15,
      durations: [5, 10, 15],
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getModelDefaultDuration('custom/video', customCap);

    expect(result).toBe(15);
  });

  it('should return undefined for non-duration models', () => {
    const result = getModelDefaultDuration(IMAGEN_4_KEY);

    expect(result).toBeUndefined();
  });
});

describe('getModelMinDuration', () => {
  it('should return first duration element from constant', () => {
    const result = getModelMinDuration(VEO_2_KEY);

    expect(result).toBe(5);
  });

  it('should return undefined when no durations exist', () => {
    const result = getModelMinDuration(IMAGEN_4_KEY);

    expect(result).toBeUndefined();
  });

  it('should use provided capability', () => {
    const customCap: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      durations: [2, 4, 8],
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getModelMinDuration('custom/video', customCap);

    expect(result).toBe(2);
  });
});

describe('hasDurationEditing', () => {
  it('should return true for video model with duration editing', () => {
    const result = hasDurationEditing(VEO_2_KEY);

    expect(result).toBe(true);
  });

  it('should return true when no capability found (default)', () => {
    const result = hasDurationEditing('nonexistent/model');

    expect(result).toBe(true);
  });

  it('should return false for image category', () => {
    const result = hasDurationEditing(IMAGEN_4_KEY);

    expect(result).toBe(false);
  });

  it('should use provided capability', () => {
    const videoCapNoDuration: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      hasDurationEditing: false,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = hasDurationEditing('custom/video', videoCapNoDuration);

    expect(result).toBe(false);
  });
});

describe('hasEndFrame', () => {
  it('should return false for model without end frame', () => {
    const result = hasEndFrame(VEO_2_KEY);

    expect(result).toBe(false);
  });

  it('should use provided capability', () => {
    const capWithEndFrame: VideoModelCapability = {
      category: ModelCategory.VIDEO,
      hasEndFrame: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = hasEndFrame('custom/video', capWithEndFrame);

    expect(result).toBe(true);
  });

  it('should return false for non-video models', () => {
    const result = hasEndFrame(IMAGEN_4_KEY);

    expect(result).toBe(false);
  });
});

describe('isReferencesMandatory', () => {
  it('should return false for imagen model (not mandatory)', () => {
    const result = isReferencesMandatory(IMAGEN_4_KEY);

    expect(result).toBe(false);
  });

  it('should use provided capability', () => {
    const mandatoryCap: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      isReferencesMandatory: true,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = isReferencesMandatory('custom/image', mandatoryCap);

    expect(result).toBe(true);
  });

  it('should return false for non-image models', () => {
    const result = isReferencesMandatory(VEO_2_KEY);

    expect(result).toBe(false);
  });
});

describe('supportsMultipleReferences', () => {
  it('should return false when maxReferences is 1', () => {
    expect(supportsMultipleReferences(IMAGEN_4_KEY)).toBe(false);
  });

  it('should return true when maxReferences > 1', () => {
    const multiRefCap: ImageModelCapability = {
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 5,
    };

    expect(supportsMultipleReferences('custom/image', multiRefCap)).toBe(true);
  });
});

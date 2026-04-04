import { ModelKey } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  getModelDefaultDuration,
  getModelDurations,
  getModelMaxOutputs,
  getModelMaxReferences,
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
  hasResolutionOptions,
  hasSpeech,
  isImagenModel,
  isOnlyImagenModels,
  isReferencesMandatory,
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
      const result = getModelMaxOutputs(ModelKey.REPLICATE_GOOGLE_IMAGEN_3);
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
      expect(isImagenModel(ModelKey.REPLICATE_GOOGLE_IMAGEN_3)).toBe(true);
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
        hasAnyImagenModel([UNKNOWN, ModelKey.REPLICATE_GOOGLE_IMAGEN_3]),
      ).toBe(true);
    });
  });

  describe('isOnlyImagenModels', () => {
    it('returns false for empty array', () => {
      expect(isOnlyImagenModels([])).toBe(false);
    });

    it('returns false when mixed models', () => {
      expect(
        isOnlyImagenModels([UNKNOWN, ModelKey.REPLICATE_GOOGLE_IMAGEN_3]),
      ).toBe(false);
    });

    it('returns true when all Imagen', () => {
      expect(
        isOnlyImagenModels([
          ModelKey.REPLICATE_GOOGLE_IMAGEN_3,
          ModelKey.REPLICATE_GOOGLE_IMAGEN_3_FAST,
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
});

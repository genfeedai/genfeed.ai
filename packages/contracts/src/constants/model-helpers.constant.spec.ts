import { ModelCategory } from '..';
import { MODEL_KEYS } from '.';

import type {
  ImageModelCapability,
  ModelOutputCapability,
  VideoModelCapability,
} from './model-capabilities.constant';
import {
  getModelDefaultDuration,
  getModelDurations,
  getModelMinDuration,
  hasDurationEditing,
  hasEndFrame,
  hasSpeech,
  isImagenModel,
  isReferencesMandatory,
  supportsMultipleReferences,
} from './model-helpers.constant';

const IMAGEN_4_KEY = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
const VEO_2_KEY = MODEL_KEYS.REPLICATE_GOOGLE_VEO_2;

describe('hasSpeech', () => {
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
});

describe('isImagenModel', () => {
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
});

describe('getModelDurations', () => {
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
});

describe('isReferencesMandatory', () => {
  it('should return false for imagen model (not mandatory)', () => {
    const result = isReferencesMandatory(IMAGEN_4_KEY);

    expect(result).toBe(false);
  });
});

describe('supportsMultipleReferences', () => {
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

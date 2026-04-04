import { ModelCategory, ModelKey } from '@genfeedai/enums';

import {
  type ImageModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
  type ModelOutputCapability,
  type VideoModelCapability,
} from './model-capabilities.constant';
import {
  getModelDefaultDuration,
  getModelDurations,
  getModelMaxOutputs,
  getModelMaxReferences,
  getModelMinDuration,
  hasDurationEditing,
  hasEndFrame,
  hasSpeech,
  isImagenModel,
  isReferencesMandatory,
  supportsMultipleOutputs,
  supportsMultipleReferences,
} from './model-helpers.constant';

const IMAGEN_4_KEY = ModelKey.REPLICATE_GOOGLE_IMAGEN_4;
const VEO_2_KEY = ModelKey.REPLICATE_GOOGLE_VEO_2;
const MUSICGEN_KEY = ModelKey.REPLICATE_META_MUSICGEN;

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

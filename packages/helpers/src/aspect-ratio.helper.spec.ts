import {
  type ImageModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
  type ModelOutputCapability,
  type VideoModelCapability,
} from '@genfeedai/constants';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';

import {
  calculateAspectRatio,
  convertRatioToOrientation,
  getAspectRatiosForModel,
  getAspectRatiosFromModel,
  getDefaultAspectRatio,
  getDefaultAspectRatioFromModel,
  isAspectRatioSupported,
  isAspectRatioSupportedFromModel,
  normalizeAspectRatioForModel,
  normalizeAspectRatioFromModel,
} from '@helpers/aspect-ratio.helper';

const IMAGEN_4_KEY = ModelKey.REPLICATE_GOOGLE_IMAGEN_4;
const VEO_2_KEY = ModelKey.REPLICATE_GOOGLE_VEO_2;
const SORA_2_KEY = ModelKey.REPLICATE_OPENAI_SORA_2;

describe('getDefaultAspectRatio', () => {
  it('should return correct default with just string key (backward compat)', () => {
    const result = getDefaultAspectRatio(IMAGEN_4_KEY);

    expect(result).toBe('1:1');
  });

  it('should use provided capability instead of looking up constant', () => {
    const customCapability: ImageModelCapability = {
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '16:9',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getDefaultAspectRatio(IMAGEN_4_KEY, customCapability);

    expect(result).toBe('16:9');
  });

  it('should return category default when capability has no defaultAspectRatio', () => {
    const capabilityWithoutDefault: ImageModelCapability = {
      aspectRatios: ['1:1', '16:9'],
      category: ModelCategory.IMAGE,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getDefaultAspectRatio(
      IMAGEN_4_KEY,
      capabilityWithoutDefault,
    );

    expect(result).toBe('1:1');
  });

  it('should return 16:9 for video models', () => {
    const result = getDefaultAspectRatio(VEO_2_KEY);

    expect(result).toBe('16:9');
  });

  it('should return 16:9 fallback when no capability found', () => {
    const result = getDefaultAspectRatio('nonexistent/model');

    expect(result).toBe('16:9');
  });

  it('should accept null capability and fall back to constant', () => {
    const result = getDefaultAspectRatio(IMAGEN_4_KEY, null);

    expect(result).toBe('1:1');
  });
});

describe('getAspectRatiosForModel', () => {
  it('should return correct ratios with just string key (backward compat)', () => {
    const result = getAspectRatiosForModel(IMAGEN_4_KEY);
    const expected = MODEL_OUTPUT_CAPABILITIES[
      IMAGEN_4_KEY
    ] as ImageModelCapability;

    expect(result).toEqual(expected.aspectRatios);
  });

  it('should use provided capability', () => {
    const customCapability: ImageModelCapability = {
      aspectRatios: ['3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '3:2',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getAspectRatiosForModel(IMAGEN_4_KEY, customCapability);

    expect(result).toEqual(['3:2', '2:3']);
  });

  it('should return empty array for text models', () => {
    const textCapability: ModelOutputCapability = {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    };

    const result = getAspectRatiosForModel('text/model', textCapability);

    expect(result).toEqual([]);
  });

  it('should return empty array for music models', () => {
    const musicCapability: ModelOutputCapability = {
      category: ModelCategory.MUSIC,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = getAspectRatiosForModel('music/model', musicCapability);

    expect(result).toEqual([]);
  });

  it('should return fallback ratios when no capability found', () => {
    const result = getAspectRatiosForModel('nonexistent/model');

    expect(result).toEqual(['1:1', '9:16', '16:9']);
  });
});

describe('isAspectRatioSupported', () => {
  it('should return true for supported ratio (backward compat)', () => {
    const result = isAspectRatioSupported(IMAGEN_4_KEY, '1:1');

    expect(result).toBe(true);
  });

  it('should return false for unsupported ratio', () => {
    const result = isAspectRatioSupported(IMAGEN_4_KEY, '21:9');

    expect(result).toBe(false);
  });

  it('should use provided capability to check support', () => {
    const customCapability: ImageModelCapability = {
      aspectRatios: ['3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '3:2',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    expect(isAspectRatioSupported(IMAGEN_4_KEY, '3:2', customCapability)).toBe(
      true,
    );
    expect(isAspectRatioSupported(IMAGEN_4_KEY, '1:1', customCapability)).toBe(
      false,
    );
  });

  it('should return false for text category models', () => {
    const textCapability: ModelOutputCapability = {
      category: ModelCategory.TEXT,
      isBatchSupported: false,
      maxOutputs: 1,
      maxReferences: 0,
    };

    const result = isAspectRatioSupported('text/model', '16:9', textCapability);

    expect(result).toBe(false);
  });
});

describe('normalizeAspectRatioForModel', () => {
  it('should return the ratio as-is when supported', () => {
    const result = normalizeAspectRatioForModel(IMAGEN_4_KEY, '1:1');

    expect(result).toBe('1:1');
  });

  it('should return default when ratio is not supported', () => {
    const result = normalizeAspectRatioForModel(IMAGEN_4_KEY, '21:9');

    expect(result).toBe('1:1');
  });

  it('should use provided capability for normalization', () => {
    const customCapability: ImageModelCapability = {
      aspectRatios: ['3:2', '2:3'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '3:2',
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
    };

    const result = normalizeAspectRatioForModel(
      IMAGEN_4_KEY,
      '1:1',
      customCapability,
    );

    expect(result).toBe('3:2');
  });

  it('should convert to orientation for models that use orientation', () => {
    const result = normalizeAspectRatioForModel(SORA_2_KEY, '4:3');

    expect(result).toBe('landscape');
  });

  it('should convert portrait ratio to portrait orientation for sora', () => {
    const result = normalizeAspectRatioForModel(SORA_2_KEY, '9:16');

    expect(result).toBe('9:16');
  });

  it('should use capability with usesOrientation for unsupported ratio', () => {
    const orientationCapability: VideoModelCapability = {
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.VIDEO,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      usesOrientation: true,
    };

    const result = normalizeAspectRatioForModel(
      'video/model',
      '3:4',
      orientationCapability,
    );

    expect(result).toBe('portrait');
  });
});

describe('calculateAspectRatio', () => {
  it('should return 16:9 for 1920x1080', () => {
    expect(calculateAspectRatio(1920, 1080)).toBe('16:9');
  });

  it('should return 9:16 for 1080x1920', () => {
    expect(calculateAspectRatio(1080, 1920)).toBe('9:16');
  });

  it('should return 1:1 for 1024x1024', () => {
    expect(calculateAspectRatio(1024, 1024)).toBe('1:1');
  });

  it('should return 16:9 when width is missing', () => {
    expect(calculateAspectRatio(undefined, 1080)).toBe('16:9');
  });

  it('should return 16:9 when height is missing', () => {
    expect(calculateAspectRatio(1920, undefined)).toBe('16:9');
  });

  it('should return 4:3 for 1600x1200', () => {
    expect(calculateAspectRatio(1600, 1200)).toBe('4:3');
  });
});

describe('convertRatioToOrientation', () => {
  it('should return portrait for 9:16', () => {
    expect(convertRatioToOrientation('9:16')).toBe('portrait');
  });

  it('should return portrait for 3:4', () => {
    expect(convertRatioToOrientation('3:4')).toBe('portrait');
  });

  it('should return landscape for 16:9', () => {
    expect(convertRatioToOrientation('16:9')).toBe('landscape');
  });

  it('should return landscape for 1:1', () => {
    expect(convertRatioToOrientation('1:1')).toBe('landscape');
  });
});

// ============================================================================
// IModel-based overload tests
// ============================================================================

function createMockModel(overrides: Partial<ModelLike> = {}): ModelLike {
  return {
    category: ModelCategory.IMAGE,
    cost: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    id: 'test-model-id',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
    label: 'Test Model',
    provider: ModelProvider.REPLICATE,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getDefaultAspectRatioFromModel', () => {
  it('should return default from DB fields', () => {
    const model = createMockModel({
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '16:9',
      maxOutputs: 4,
    });

    expect(getDefaultAspectRatioFromModel(model)).toBe('16:9');
  });

  it('should fall back to constant when no DB fields', () => {
    const model = createMockModel({
      key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      maxOutputs: undefined,
    });

    expect(getDefaultAspectRatioFromModel(model)).toBe('1:1');
  });
});

describe('getAspectRatiosFromModel', () => {
  it('should return aspect ratios from DB fields', () => {
    const model = createMockModel({
      aspectRatios: ['3:2', '2:3', '1:1'],
      category: ModelCategory.IMAGE,
      maxOutputs: 4,
    });

    expect(getAspectRatiosFromModel(model)).toEqual(['3:2', '2:3', '1:1']);
  });
});

describe('normalizeAspectRatioFromModel', () => {
  it('should return the ratio when supported', () => {
    const model = createMockModel({
      aspectRatios: ['1:1', '16:9'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      maxOutputs: 4,
    });

    expect(normalizeAspectRatioFromModel(model, '16:9')).toBe('16:9');
  });

  it('should return default when ratio is not supported', () => {
    const model = createMockModel({
      aspectRatios: ['1:1', '16:9'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      maxOutputs: 4,
    });

    expect(normalizeAspectRatioFromModel(model, '21:9')).toBe('1:1');
  });
});

describe('isAspectRatioSupportedFromModel', () => {
  it('should return true for supported ratio', () => {
    const model = createMockModel({
      aspectRatios: ['1:1', '16:9', '9:16'],
      category: ModelCategory.IMAGE,
      maxOutputs: 4,
    });

    expect(isAspectRatioSupportedFromModel(model, '16:9')).toBe(true);
  });

  it('should return false for unsupported ratio', () => {
    const model = createMockModel({
      aspectRatios: ['1:1', '16:9'],
      category: ModelCategory.IMAGE,
      maxOutputs: 4,
    });

    expect(isAspectRatioSupportedFromModel(model, '21:9')).toBe(false);
  });
});

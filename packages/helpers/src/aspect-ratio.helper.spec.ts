import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import {
  type ImageModelCapability,
  MODEL_KEYS,
  type VideoModelCapability,
} from '@genfeedai/contracts/constants';

import {
  isAspectRatioSupported,
  normalizeAspectRatioForModel,
  normalizeAspectRatioFromModel,
} from '@helpers/aspect-ratio.helper';

const IMAGEN_4_KEY = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;

describe('isAspectRatioSupported', () => {
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
});

describe('normalizeAspectRatioForModel', () => {
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
    key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    label: 'Test Model',
    provider: ModelProvider.REPLICATE,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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
});

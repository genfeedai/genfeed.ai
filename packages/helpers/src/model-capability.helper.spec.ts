import {
  type ImageModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
  type VideoModelCapability,
} from '@genfeedai/constants';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';

import {
  getModelCapability,
  getModelCapabilityByKey,
  getModelCapabilityFromDoc,
} from '@helpers/model-capability.helper';

function createMockModel(overrides: Partial<IModel> = {}): IModel {
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

describe('getModelCapabilityFromDoc', () => {
  it('should return correct shape from IModel with all fields populated', () => {
    const model = createMockModel({
      aspectRatios: ['1:1', '16:9'],
      category: ModelCategory.IMAGE,
      defaultAspectRatio: '1:1',
      isBatchSupported: true,
      isImagenModel: true,
      isReferencesMandatory: false,
      maxOutputs: 8,
      maxReferences: 5,
    });

    const result = getModelCapabilityFromDoc(model);

    expect(result).not.toBeNull();
    expect(result?.category).toBe(ModelCategory.IMAGE);
    expect(result?.maxOutputs).toBe(8);
    expect(result?.isBatchSupported).toBe(true);
    expect(result?.maxReferences).toBe(5);

    const imageResult = result as ImageModelCapability;
    expect(imageResult.aspectRatios).toEqual(['1:1', '16:9']);
    expect(imageResult.defaultAspectRatio).toBe('1:1');
    expect(imageResult.isImagenModel).toBe(true);
    expect(imageResult.isReferencesMandatory).toBe(false);
  });

  it('should return null when maxOutputs is undefined', () => {
    const model = createMockModel({
      maxOutputs: undefined,
    });

    const result = getModelCapabilityFromDoc(model);

    expect(result).toBeNull();
  });

  it('should return sensible defaults for missing optional fields', () => {
    const model = createMockModel({
      category: ModelCategory.IMAGE,
      maxOutputs: 2,
    });

    const result = getModelCapabilityFromDoc(model);

    expect(result).not.toBeNull();
    expect(result?.maxOutputs).toBe(2);
    expect(result?.isBatchSupported).toBe(false);
    expect(result?.maxReferences).toBe(1);

    const imageResult = result as ImageModelCapability;
    expect(imageResult.aspectRatios).toBeUndefined();
    expect(imageResult.defaultAspectRatio).toBeUndefined();
    expect(imageResult.isImagenModel).toBeUndefined();
    expect(imageResult.isReferencesMandatory).toBeUndefined();
  });

  it('should build video capability with all video-specific fields', () => {
    const model = createMockModel({
      aspectRatios: ['16:9', '9:16'],
      category: ModelCategory.VIDEO,
      defaultAspectRatio: '16:9',
      defaultDuration: 5,
      durations: [5, 10],
      hasAudioToggle: true,
      hasDurationEditing: true,
      hasEndFrame: true,
      hasInterpolation: true,
      hasResolutionOptions: true,
      hasSpeech: true,
      isBatchSupported: false,
      maxOutputs: 4,
      maxReferences: 1,
      usesOrientation: true,
    });

    const result = getModelCapabilityFromDoc(model);

    expect(result).not.toBeNull();
    expect(result?.category).toBe(ModelCategory.VIDEO);

    const videoResult = result as VideoModelCapability;
    expect(videoResult.hasEndFrame).toBe(true);
    expect(videoResult.hasInterpolation).toBe(true);
    expect(videoResult.hasSpeech).toBe(true);
    expect(videoResult.hasAudioToggle).toBe(true);
    expect(videoResult.hasDurationEditing).toBe(true);
    expect(videoResult.hasResolutionOptions).toBe(true);
    expect(videoResult.usesOrientation).toBe(true);
    expect(videoResult.durations).toEqual([5, 10]);
    expect(videoResult.defaultDuration).toBe(5);
  });

  it('should return null for unknown category', () => {
    const model = createMockModel({
      category: 'unknown-category' as ModelCategory,
      maxOutputs: 4,
    });

    const result = getModelCapabilityFromDoc(model);

    expect(result).toBeNull();
  });
});

describe('getModelCapability', () => {
  it('should use DB fields when available', () => {
    const model = createMockModel({
      category: ModelCategory.IMAGE,
      isBatchSupported: true,
      isImagenModel: false,
      maxOutputs: 10,
      maxReferences: 3,
    });

    const result = getModelCapability(model);

    expect(result).not.toBeNull();
    expect(result?.maxOutputs).toBe(10);
    expect(result?.isBatchSupported).toBe(true);
    expect(result?.maxReferences).toBe(3);
  });

  it('should fall back to constant when DB fields are missing', () => {
    const model = createMockModel({
      key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      maxOutputs: undefined,
    });

    const result = getModelCapability(model);
    const expected =
      MODEL_OUTPUT_CAPABILITIES[ModelKey.REPLICATE_GOOGLE_IMAGEN_4];

    expect(result).not.toBeNull();
    expect(result).toEqual(expected);
  });

  it('should return null when both DB fields and constant are missing', () => {
    const model = createMockModel({
      key: 'nonexistent/model' as ModelKey,
      maxOutputs: undefined,
    });

    const result = getModelCapability(model);

    expect(result).toBeNull();
  });

  it('should prefer DB fields over constant', () => {
    const model = createMockModel({
      category: ModelCategory.IMAGE,
      isBatchSupported: true,
      key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      maxOutputs: 99,
      maxReferences: 50,
    });

    const result = getModelCapability(model);

    expect(result).not.toBeNull();
    expect(result?.maxOutputs).toBe(99);
    expect(result?.isBatchSupported).toBe(true);
    expect(result?.maxReferences).toBe(50);
  });
});

describe('getModelCapabilityByKey', () => {
  it('should use model document when provided', () => {
    const model = createMockModel({
      category: ModelCategory.IMAGE,
      isBatchSupported: true,
      maxOutputs: 20,
      maxReferences: 7,
    });

    const result = getModelCapabilityByKey(
      ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      model,
    );

    expect(result).not.toBeNull();
    expect(result?.maxOutputs).toBe(20);
    expect(result?.isBatchSupported).toBe(true);
  });

  it('should fall back to constant when no model is provided', () => {
    const result = getModelCapabilityByKey(ModelKey.REPLICATE_GOOGLE_IMAGEN_4);
    const expected =
      MODEL_OUTPUT_CAPABILITIES[ModelKey.REPLICATE_GOOGLE_IMAGEN_4];

    expect(result).not.toBeNull();
    expect(result).toEqual(expected);
  });

  it('should return null for unknown key without model', () => {
    const result = getModelCapabilityByKey('nonexistent/model');

    expect(result).toBeNull();
  });

  it('should use model DB fields via getModelCapability when model is provided', () => {
    const model = createMockModel({
      category: ModelCategory.IMAGE,
      key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      maxOutputs: 15,
    });

    const result = getModelCapabilityByKey(
      ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      model,
    );

    expect(result).not.toBeNull();
    expect(result?.maxOutputs).toBe(15);
  });
});

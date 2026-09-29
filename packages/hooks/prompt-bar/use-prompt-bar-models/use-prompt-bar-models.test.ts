import type { IModel } from '@genfeedai/contracts/interfaces';
import { usePromptBarModels } from '@hooks/prompt-bar/use-prompt-bar-models/use-prompt-bar-models';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock the constants module
vi.mock('@genfeedai/contracts/constants', () => ({
  getModelMaxReferences: vi.fn((modelKey: string) => {
    if (modelKey === 'model-multi-ref') {
      return 5;
    }
    return 1;
  }),
  hasAnyAudioToggle: vi.fn((models: string[]) =>
    models.includes('model-audio'),
  ),
  hasAnyEndFrame: vi.fn((models: string[]) =>
    models.includes('model-endframe'),
  ),
  hasAnyImagenModel: vi.fn((models: string[]) =>
    models.includes('model-imagen'),
  ),
  hasAnyInterpolation: vi.fn((models: string[]) =>
    models.includes('model-interpolation'),
  ),
  hasAnyResolutionOptions: vi.fn((models: string[]) =>
    models.includes('model-resolution'),
  ),
  hasAnySpeech: vi.fn((models: string[]) => models.includes('model-speech')),
  hasModelWithoutDurationEditing: vi.fn((models: string[]) =>
    models.includes('model-no-duration'),
  ),
  isOnlyImagenModels: vi.fn((models: string[]) =>
    models.every((m: string) => m === 'model-imagen'),
  ),
  isReferencesMandatory: vi.fn(
    (modelKey: string) => modelKey === 'model-ref-required',
  ),
  supportsMultipleReferences: vi.fn(
    (modelKey: string) => modelKey === 'model-multi-ref',
  ),
}));

const createMockModel = (overrides: Partial<IModel> = {}): IModel =>
  ({
    id: 'model-1',
    key: 'model-key-1',
    name: 'Test Model',
    provider: 'test',
    ...overrides,
  }) as IModel;

const createMockTraining = (id: string) => ({
  id,
  name: 'Test Training',
});

const baseOptions = {
  models: [] as IModel[],
  normalizedWatchedModels: [] as string[],
  trainings: [],
  watchedModel: 'default-model' as string,
};

describe('usePromptBarModels', () => {
  describe('Training IDs', () => {
    it('computes training IDs set from trainings', () => {
      const trainings = [
        createMockTraining('training-1'),
        createMockTraining('training-2'),
      ];

      const { result } = renderHook(() =>
        usePromptBarModels({ ...baseOptions, trainings }),
      );

      expect(result.current.trainingIds.has('training-1')).toBe(true);
      expect(result.current.trainingIds.has('training-2')).toBe(true);
      expect(result.current.trainingIds.size).toBe(2);
    });

    it('filters out null/undefined training IDs', () => {
      const trainings = [
        createMockTraining('training-1'),
        { id: null, name: 'Null Training' },
        { id: undefined, name: 'Undefined Training' },
      ];

      const { result } = renderHook(() =>
        usePromptBarModels({ ...baseOptions, trainings: trainings as any }),
      );

      expect(result.current.trainingIds.size).toBe(1);
      expect(result.current.trainingIds.has('training-1')).toBe(true);
    });
  });

  describe('Selected Models', () => {
    it('filters models based on watched model keys', () => {
      const models = [
        createMockModel({ id: '1', key: 'model-a' as string }),
        createMockModel({ id: '2', key: 'model-b' as string }),
        createMockModel({ id: '3', key: 'model-c' as string }),
      ];

      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          models,
          normalizedWatchedModels: ['model-a', 'model-c'],
        }),
      );

      expect(result.current.selectedModels).toHaveLength(2);
      expect(result.current.selectedModels.map((m) => m.key)).toContain(
        'model-a',
      );
      expect(result.current.selectedModels.map((m) => m.key)).toContain(
        'model-c',
      );
    });
  });

  describe('getUnionFromAllModels Helper', () => {
    it('sorts numeric values', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a'],
        }),
      );

      const union = result.current.getUnionFromAllModels(() => [3, 1, 2]);
      expect(union).toEqual([1, 2, 3]);
    });

    it('sorts string values alphabetically', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a'],
        }),
      );

      const union = result.current.getUnionFromAllModels(() => ['c', 'a', 'b']);
      expect(union).toEqual(['a', 'b', 'c']);
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => usePromptBarModels(baseOptions));

      expect(result.current).toHaveProperty('trainingIds');
      expect(result.current).toHaveProperty('selectedModels');
      expect(result.current).toHaveProperty('hasAnyModel');
      expect(result.current).toHaveProperty('getUnionFromAllModels');
      expect(result.current).toHaveProperty('getMinFromAllModels');
      expect(result.current).toHaveProperty('supportsMultipleReferences');
      expect(result.current).toHaveProperty('requiresReferences');
      expect(result.current).toHaveProperty('maxReferenceCount');
      expect(result.current).toHaveProperty('isOnlyImagenModels');
      expect(result.current).toHaveProperty('hasAnyImagenModel');
      expect(result.current).toHaveProperty('hasSpeech');
      expect(result.current).toHaveProperty('hasEndFrame');
      expect(result.current).toHaveProperty('supportsInterpolation');
      expect(result.current).toHaveProperty('hasAudioToggle');
      expect(result.current).toHaveProperty('hasModelWithoutDurationEditing');
      expect(result.current).toHaveProperty('hasAnyResolutionOptions');
    });
  });
});

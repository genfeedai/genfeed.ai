import type { IModel } from '@genfeedai/interfaces';
import { usePromptBarModels } from '@hooks/prompt-bar/use-prompt-bar-models/use-prompt-bar-models';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock the constants module
vi.mock('@genfeedai/constants', () => ({
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

    it('returns empty set when no trainings', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({ ...baseOptions, trainings: [] }),
      );

      expect(result.current.trainingIds.size).toBe(0);
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

    it('returns empty array when no models match', () => {
      const models = [createMockModel({ key: 'model-a' as string })];

      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          models,
          normalizedWatchedModels: ['model-b'],
        }),
      );

      expect(result.current.selectedModels).toHaveLength(0);
    });
  });

  describe('hasAnyModel Helper', () => {
    it('returns true when any model matches predicate', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a', 'model-b'],
        }),
      );

      const hasModelA = result.current.hasAnyModel(
        (modelKey) => modelKey === ('model-a' as string),
      );
      expect(hasModelA).toBe(true);
    });

    it('returns false when no models match predicate', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a', 'model-b'],
        }),
      );

      const hasModelC = result.current.hasAnyModel(
        (modelKey) => modelKey === ('model-c' as string),
      );
      expect(hasModelC).toBe(false);
    });
  });

  describe('getUnionFromAllModels Helper', () => {
    it('returns union of values from all models', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a', 'model-b'],
        }),
      );

      const union = result.current.getUnionFromAllModels((modelKey) => {
        if (modelKey === 'model-a') {
          return [1, 2];
        }
        if (modelKey === 'model-b') {
          return [2, 3];
        }
        return [];
      });

      expect(union).toEqual([1, 2, 3]);
    });

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

  describe('getMinFromAllModels Helper', () => {
    it('returns minimum value from all models', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-a', 'model-b'],
        }),
      );

      const min = result.current.getMinFromAllModels((modelKey) => {
        if (modelKey === 'model-a') {
          return 5;
        }
        if (modelKey === 'model-b') {
          return 3;
        }
        return 10;
      });

      expect(min).toBe(3);
    });

    it('uses watchedModel when no normalized models', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: [],
          watchedModel: 'default-model' as string,
        }),
      );

      const min = result.current.getMinFromAllModels((modelKey) => {
        if (modelKey === 'default-model') {
          return 7;
        }
        return 10;
      });

      expect(min).toBe(7);
    });
  });

  describe('Feature Flags', () => {
    it('detects multiple reference support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-multi-ref'],
        }),
      );

      expect(result.current.supportsMultipleReferences).toBe(true);
    });

    it('detects required references', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-ref-required'],
        }),
      );

      expect(result.current.requiresReferences).toBe(true);
    });

    it('computes max reference count', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-multi-ref'],
        }),
      );

      expect(result.current.maxReferenceCount).toBe(5);
    });

    it('detects imagen-only models', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-imagen'],
        }),
      );

      expect(result.current.isOnlyImagenModels).toBe(true);
    });

    it('detects any imagen model', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-imagen', 'other-model'],
        }),
      );

      expect(result.current.hasAnyImagenModel).toBe(true);
    });

    it('detects speech support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-speech'],
        }),
      );

      expect(result.current.hasSpeech).toBe(true);
    });

    it('detects end frame support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-endframe'],
        }),
      );

      expect(result.current.hasEndFrame).toBe(true);
    });

    it('detects interpolation support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-interpolation'],
        }),
      );

      expect(result.current.supportsInterpolation).toBe(true);
    });

    it('detects audio toggle support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-audio'],
        }),
      );

      expect(result.current.hasAudioToggle).toBe(true);
    });

    it('detects models without duration editing', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-no-duration'],
        }),
      );

      expect(result.current.hasModelWithoutDurationEditing).toBe(true);
    });

    it('detects resolution options support', () => {
      const { result } = renderHook(() =>
        usePromptBarModels({
          ...baseOptions,
          normalizedWatchedModels: ['model-resolution'],
        }),
      );

      expect(result.current.hasAnyResolutionOptions).toBe(true);
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

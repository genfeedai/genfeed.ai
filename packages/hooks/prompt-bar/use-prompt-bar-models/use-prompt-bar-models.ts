import {
  getModelMaxReferences,
  hasAnyAudioToggle,
  hasAnyEndFrame,
  hasAnyImagenModel,
  hasAnyInterpolation,
  hasAnyResolutionOptions,
  hasAnySpeech,
  hasModelWithoutDurationEditing,
  isOnlyImagenModels,
  isReferencesMandatory,
  supportsMultipleReferences as modelSupportsMultipleReferences,
} from '@genfeedai/constants';
import type { IModel } from '@genfeedai/interfaces';
import type {
  UsePromptBarModelsOptions,
  UsePromptBarModelsReturn,
} from '@props/studio/prompt-bar.props';
import { useCallback, useMemo } from 'react';

export function usePromptBarModels(
  options: UsePromptBarModelsOptions,
): UsePromptBarModelsReturn {
  const { models, trainings, normalizedWatchedModels, watchedModel } = options;

  const trainingIds = useMemo(() => {
    const ids =
      trainings
        ?.filter((training) => training?.id)
        .map((training) => training.id) ?? [];
    return new Set(ids);
  }, [trainings]);

  const selectedModels = useMemo(
    () =>
      models.filter((model: IModel) =>
        normalizedWatchedModels.includes(model.key),
      ),
    [models, normalizedWatchedModels],
  );

  const hasAnyModel = useCallback(
    (predicate: (modelKey: string) => boolean): boolean =>
      normalizedWatchedModels.some((modelKey: string) =>
        predicate(modelKey as string),
      ),
    [normalizedWatchedModels],
  );

  const getUnionFromAllModels = useCallback(
    <T extends number | string>(getter: (modelKey: string) => T[]): T[] => {
      const allValues = new Set<T>();
      for (const modelKey of normalizedWatchedModels) {
        for (const value of getter(modelKey as string)) {
          allValues.add(value);
        }
      }
      return Array.from(allValues).sort((a, b) =>
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b)),
      );
    },
    [normalizedWatchedModels],
  );

  const getMinFromAllModels = useCallback(
    (getter: (modelKey: string) => number): number => {
      if (normalizedWatchedModels.length === 0) {
        return getter(watchedModel);
      }
      return Math.min(
        ...normalizedWatchedModels.map((modelKey: string) =>
          getter(modelKey as string),
        ),
      );
    },
    [normalizedWatchedModels, watchedModel],
  );

  const supportsMultipleReferences = hasAnyModel(
    modelSupportsMultipleReferences,
  );
  const requiresReferences = hasAnyModel(isReferencesMandatory);
  const maxReferenceCount = getMinFromAllModels(getModelMaxReferences);

  const featureFlags = useMemo(
    () => ({
      hasAnyImagenModel: hasAnyImagenModel(normalizedWatchedModels),
      hasAnyResolutionOptions: hasAnyResolutionOptions(normalizedWatchedModels),
      hasAudioToggle: hasAnyAudioToggle(normalizedWatchedModels),
      hasEndFrame: hasAnyEndFrame(normalizedWatchedModels),
      hasModelWithoutDurationEditing: hasModelWithoutDurationEditing(
        normalizedWatchedModels,
      ),
      hasSpeech: hasAnySpeech(normalizedWatchedModels),
      isOnlyImagenModels: isOnlyImagenModels(normalizedWatchedModels),
      supportsInterpolation: hasAnyInterpolation(normalizedWatchedModels),
    }),
    [normalizedWatchedModels],
  );

  return {
    getMinFromAllModels,
    getUnionFromAllModels,
    hasAnyModel,
    maxReferenceCount,
    requiresReferences,
    selectedModels,
    supportsMultipleReferences,
    trainingIds,
    ...featureFlags,
  };
}

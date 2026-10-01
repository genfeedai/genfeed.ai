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
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type {
  UsePromptBarModelsOptions,
  UsePromptBarModelsReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
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

  const crunModels = selectedModels.filter(
    (model) => model.provider === 'crun' && model.inputControls,
  );
  const videoControls =
    selectedModels.length === 1 &&
    crunModels[0]?.inputControls?.mediaKind === 'video'
      ? crunModels[0].inputControls
      : undefined;
  const supportsMultipleReferences =
    !videoControls &&
    (crunModels.some(
      (model) =>
        Math.max(
          0,
          ...Object.keys(model.inputControls?.referenceRoles ?? {}).map(
            (field) => model.inputControls?.fields[field]?.maxItems ?? 0,
          ),
        ) > 1,
    ) ||
      hasAnyModel(modelSupportsMultipleReferences));
  const requiresReferences =
    !videoControls && hasAnyModel(isReferencesMandatory);
  const maxReferenceCount = videoControls
    ? videoControls.videoRules?.referenceMode === 'start-end'
      ? 1
      : 0
    : selectedModels.length
      ? Math.min(
          ...selectedModels.map((model) =>
            model.provider === 'crun' && model.inputControls
              ? Math.max(
                  0,
                  ...Object.keys(model.inputControls.referenceRoles).map(
                    (field) =>
                      model.inputControls?.fields[field]?.maxItems ?? 0,
                  ),
                )
              : getModelMaxReferences(model.key),
          ),
        )
      : getMinFromAllModels(getModelMaxReferences);

  const featureFlags = useMemo(
    () =>
      videoControls
        ? {
            hasAnyImagenModel: false,
            hasAnyResolutionOptions: Boolean(videoControls.fields.resolution),
            hasAudioToggle: false,
            hasEndFrame:
              videoControls.videoRules?.referenceMode === 'start-end',
            hasModelWithoutDurationEditing: false,
            hasSpeech: false,
            isOnlyImagenModels: false,
            supportsInterpolation:
              videoControls.videoRules?.referenceMode === 'start-end',
          }
        : {
            hasAnyImagenModel: hasAnyImagenModel(normalizedWatchedModels),
            hasAnyResolutionOptions: hasAnyResolutionOptions(
              normalizedWatchedModels,
            ),
            hasAudioToggle: hasAnyAudioToggle(normalizedWatchedModels),
            hasEndFrame: hasAnyEndFrame(normalizedWatchedModels),
            hasModelWithoutDurationEditing: hasModelWithoutDurationEditing(
              normalizedWatchedModels,
            ),
            hasSpeech: hasAnySpeech(normalizedWatchedModels),
            isOnlyImagenModels: isOnlyImagenModels(normalizedWatchedModels),
            supportsInterpolation: hasAnyInterpolation(normalizedWatchedModels),
          },
    [normalizedWatchedModels, videoControls],
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

import type {
  IElementBlacklist,
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFontFamily,
  IModel,
  IPreset,
  ISound,
  ITag,
  ITraining,
} from '@cloud/interfaces';
import { IngredientCategory, ModelCategory } from '@genfeedai/enums';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import { useElementsContext } from '@providers/elements/elements.provider';
import { usePromptBarContext } from '@providers/promptbar/promptbar.provider';
import { useCallback, useMemo, useState } from 'react';

export interface ElementsOptions {
  initialFilter?: string;
  type?: 'image' | 'video' | 'image-to-video' | 'voice' | 'music' | 'all';
}

export interface ElementsReturn {
  moods: IElementMood[];
  styles: IElementStyle[];
  fontFamilies: IFontFamily[];
  cameras: IElementCamera[];
  presets: IPreset[];
  models: IModel[];
  blacklists: IElementBlacklist[];
  sounds: ISound[];
  scenes: IElementScene[];
  tags: ITag[];
  lightings: IElementLighting[];
  lenses: IElementLens[];
  cameraMovements: IElementCameraMovement[];
  imageModels: IModel[];
  imageEditModels: IModel[];
  videoModels: IModel[];
  videoEditModels: IModel[];
  voiceModels: IModel[];
  musicModels: IModel[];
  trainings: ITraining[];
  isLoading: boolean;
  isRefreshing: boolean;
  filter: string;
  setFilter: (filter: string) => void;
  filteredMoods: IElementMood[];
  filteredStyles: IElementStyle[];
  filteredFontFamilies: IFontFamily[];
  filteredCameras: IElementCamera[];
  filteredPresets: IPreset[];
  filteredBlacklists: IElementBlacklist[];
  filteredSounds: ISound[];
  filteredScenes: IElementScene[];
  filteredLightings: IElementLighting[];
  filteredLenses: IElementLens[];
  filteredCameraMovements: IElementCameraMovement[];
  findAllElements: (isRefreshing?: boolean) => Promise<void>;
}

/**
 * Hook to access elements data from both contexts and provide filtered results
 * Merges ElementsProvider (core elements) with PromptBarProvider (models, presets, etc.)
 */
export function useElements({
  initialFilter = '',
  type = 'all',
}: ElementsOptions = {}): ElementsReturn {
  const elementsData = useElementsContext();
  const promptBarData = usePromptBarContext();

  const [filter, setFilter] = useState(initialFilter);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const contextData = {
    ...elementsData,
    ...promptBarData,
  };

  // Filter field extractors
  const filterByKey = useCallback((item: { key: string }) => [item.key], []);
  const filterByKeyAndLabel = useCallback(
    (item: { key: string; label?: string }) =>
      [item.key, item.label].filter(Boolean),
    [],
  );

  // Factory for creating filtered data hooks - reduces repetition
  const createFiltered = <T extends { key?: string }>(
    data: T[] | undefined,
    filterFields: (item: T) => (string | undefined)[] = filterByKey as (
      item: T,
    ) => (string | undefined)[],
  ) => useFilteredData({ data: data || [], filter, filterFields });

  // Filtered element data
  const filteredMoods = createFiltered(contextData.moods);
  const filteredStyles = createFiltered(contextData.styles);
  const filteredFontFamilies = createFiltered(contextData.fontFamilies);
  const filteredCameras = createFiltered(contextData.cameras);
  const filteredPresets = createFiltered(
    contextData.presets,
    filterByKeyAndLabel,
  );
  const filteredBlacklists = createFiltered(contextData.blacklists);
  const filteredSounds = createFiltered(contextData.sounds);
  const filteredScenes = createFiltered(contextData.scenes);
  const filteredLightings = createFiltered(contextData.lightings);
  const filteredLenses = createFiltered(contextData.lenses);
  const filteredCameraMovements = createFiltered(contextData.cameraMovements);

  // Helper to filter models by category
  const filterModelsByCategory = useCallback(
    (category: ModelCategory): IModel[] =>
      (contextData.models || []).filter(
        (model: IModel) =>
          model.category === category && !model.isDeleted && model.isActive,
      ),
    [contextData.models],
  );

  // Memoized model categories - consolidated using useMemo with object
  const modelsByCategory = useMemo(
    () => ({
      image: filterModelsByCategory(ModelCategory.IMAGE),
      imageEdit: filterModelsByCategory(ModelCategory.IMAGE_EDIT),
      music: filterModelsByCategory(ModelCategory.MUSIC),
      video: filterModelsByCategory(ModelCategory.VIDEO),
      videoEdit: filterModelsByCategory(ModelCategory.VIDEO_EDIT),
      voice: filterModelsByCategory(ModelCategory.VOICE),
    }),
    [filterModelsByCategory],
  );

  const {
    image: imageModels,
    imageEdit: imageEditModels,
    video: videoModels,
    videoEdit: videoEditModels,
    voice: voiceModels,
    music: musicModels,
  } = modelsByCategory;

  const filteredModelsByType = useMemo(() => {
    if (type === 'all') {
      return contextData.models;
    }

    switch (type) {
      case IngredientCategory.IMAGE:
        return imageModels;
      case IngredientCategory.VIDEO:
        return videoModels;
      case IngredientCategory.VOICE:
        return voiceModels;
      case IngredientCategory.MUSIC:
        return musicModels;
      default:
        return contextData.models || [];
    }
  }, [
    type,
    contextData.models,
    imageModels,
    videoModels,
    voiceModels,
    musicModels,
  ]);

  const findAllElements = async (refresh = false): Promise<void> => {
    setIsRefreshing(refresh);
    try {
      await Promise.all([elementsData.refetch(), promptBarData.refetch()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    blacklists: contextData.blacklists || [],
    cameraMovements: contextData.cameraMovements || [],
    cameras: contextData.cameras || [],
    filter,
    filteredBlacklists,
    filteredCameraMovements,
    filteredCameras,
    filteredFontFamilies,
    filteredLenses,
    filteredLightings,

    filteredMoods,
    filteredPresets,
    filteredScenes,
    filteredSounds,
    filteredStyles,
    findAllElements,
    fontFamilies: contextData.fontFamilies || [],
    imageEditModels,
    imageModels,
    isLoading: elementsData.isLoading || promptBarData.isLoading,
    isRefreshing,
    lenses: contextData.lenses || [],
    lightings: contextData.lightings || [],

    models: filteredModelsByType,
    moods: contextData.moods || [],
    musicModels,
    presets: contextData.presets || [],
    scenes: contextData.scenes || [],
    setFilter,
    sounds: contextData.sounds || [],
    styles: contextData.styles || [],
    tags: contextData.tags || [],
    trainings: contextData.trainings || [],
    videoEditModels,
    videoModels,
    voiceModels,
  };
}

import {
  IngredientCategory,
  ModelCategory,
  type ModelKey,
} from '@genfeedai/enums';
import type {
  UsePromptBarFiltersOptions,
  UsePromptBarFiltersReturn,
} from '@props/studio/prompt-bar.props';
import { useMemo } from 'react';

export function usePromptBarFilters(
  options: UsePromptBarFiltersOptions,
): UsePromptBarFiltersReturn {
  const {
    styles,
    moods,
    cameras,
    scenes,
    lightings,
    lenses,
    cameraMovements,
    fontFamilies,
    presets,
    blacklists,
    sounds,
    currentModelCategory,
    normalizedWatchedModels,
  } = options;

  const filteredStyles = useMemo(() => {
    if (!currentModelCategory && normalizedWatchedModels.length === 0) {
      return styles;
    }

    return styles.filter((style) => {
      if (
        style.models &&
        style.models.length > 0 &&
        normalizedWatchedModels.length > 0
      ) {
        return normalizedWatchedModels.some((modelKey: string) =>
          style.models?.includes(modelKey as ModelKey),
        );
      }

      if (currentModelCategory && style.category) {
        return style.category === currentModelCategory;
      }

      return !style.category && (!style.models || style.models.length === 0);
    });
  }, [styles, currentModelCategory, normalizedWatchedModels]);

  const filteredMoods = useMemo(() => {
    if (!currentModelCategory) {
      return moods;
    }
    return moods.filter(
      (mood) => !mood.category || mood.category === currentModelCategory,
    );
  }, [moods, currentModelCategory]);

  const filteredCameras = useMemo(() => {
    if (!currentModelCategory) {
      return cameras;
    }
    return cameras.filter(
      (camera) => !camera.category || camera.category === currentModelCategory,
    );
  }, [cameras, currentModelCategory]);

  const filteredScenes = useMemo(() => {
    if (!currentModelCategory) {
      return scenes;
    }
    return scenes.filter(
      (scene) => !scene.category || scene.category === currentModelCategory,
    );
  }, [scenes, currentModelCategory]);

  const filteredLightings = useMemo(() => {
    if (!currentModelCategory) {
      return lightings;
    }
    return lightings.filter(
      (lighting) =>
        !lighting.category || lighting.category === currentModelCategory,
    );
  }, [lightings, currentModelCategory]);

  const filteredLenses = useMemo(() => {
    if (!currentModelCategory) {
      return lenses;
    }
    return lenses.filter(
      (lens) => !lens.category || lens.category === currentModelCategory,
    );
  }, [lenses, currentModelCategory]);

  const filteredCameraMovements = useMemo(() => {
    if (!currentModelCategory) {
      return cameraMovements;
    }
    return cameraMovements.filter(
      (movement) =>
        !movement.category || movement.category === currentModelCategory,
    );
  }, [cameraMovements, currentModelCategory]);

  const filteredFontFamilies = useMemo(() => {
    if (!currentModelCategory) {
      return fontFamilies;
    }
    return fontFamilies.filter(
      (font) => !font.category || font.category === currentModelCategory,
    );
  }, [fontFamilies, currentModelCategory]);

  const filteredPresets = useMemo(() => {
    if (!currentModelCategory) {
      return presets;
    }

    return presets.filter(
      (preset) =>
        !preset.category ||
        preset.category === currentModelCategory ||
        preset.platform,
    );
  }, [presets, currentModelCategory]);

  const filteredBlacklists = useMemo(() => {
    if (!blacklists || blacklists.length === 0) {
      return [];
    }

    const targetCategory = currentModelCategory || ModelCategory.VIDEO;
    return blacklists.filter(
      (blacklist) => blacklist.category === targetCategory,
    );
  }, [blacklists, currentModelCategory]);

  const filteredSounds = useMemo(() => {
    if (
      !sounds ||
      sounds.length === 0 ||
      currentModelCategory !== ModelCategory.VIDEO
    ) {
      return [];
    }

    return sounds.filter(
      (sound) =>
        sound.isActive &&
        (!sound.category || sound.category === IngredientCategory.VIDEO),
    );
  }, [sounds, currentModelCategory]);

  return {
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
  };
}

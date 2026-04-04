import type { IModel } from '@cloud/interfaces';
import {
  getModelDefaultDuration,
  getModelDurations,
} from '@genfeedai/constants';
import {
  IngredientFormat,
  ModelCategory,
  type ModelKey,
} from '@genfeedai/enums';

import {
  getAspectRatiosFromModel,
  getDefaultAspectRatioFromModel,
  isAspectRatioSupportedFromModel,
} from './aspect-ratio.helper';
import { getModelCapability } from './model-capability.helper';

export const DEFAULT_GENERATION_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const;

export const DEFAULT_VIDEO_DURATION_OPTIONS = [5, 10] as const;

const FORMAT_TO_ASPECT_RATIO: Record<string, string> = {
  [IngredientFormat.PORTRAIT]: '9:16',
  [IngredientFormat.LANDSCAPE]: '16:9',
  [IngredientFormat.SQUARE]: '1:1',
};

const ASPECT_RATIO_TO_FORMAT: Partial<Record<string, IngredientFormat>> = {
  '1:1': IngredientFormat.SQUARE,
  '9:16': IngredientFormat.PORTRAIT,
  '16:9': IngredientFormat.LANDSCAPE,
};

export interface GenerationModelControls {
  availableAspectRatios: string[];
  defaultAspectRatio: string;
  defaultDuration?: number;
  durationOptions: number[];
  showDuration: boolean;
}

export function getAspectRatioForFormat(
  format?: IngredientFormat | string | null,
): string | null {
  if (!format) {
    return null;
  }

  return FORMAT_TO_ASPECT_RATIO[format] ?? null;
}

export function getFormatForAspectRatio(
  aspectRatio?: string | null,
): IngredientFormat | null {
  if (!aspectRatio) {
    return null;
  }

  return ASPECT_RATIO_TO_FORMAT[aspectRatio] ?? null;
}

export function filterModelsByAspectRatio(
  models: IModel[],
  aspectRatio?: string | null,
  category?: ModelCategory,
): IModel[] {
  return models.filter((model) => {
    if (category && model.category !== category) {
      return false;
    }

    if (!aspectRatio) {
      return true;
    }

    return isAspectRatioSupportedFromModel(model, aspectRatio);
  });
}

export function resolveGenerationModelControls(
  model: IModel | null,
  generationType: 'image' | 'video',
): GenerationModelControls {
  const availableAspectRatios = model
    ? [...getAspectRatiosFromModel(model)]
    : [];
  const resolvedAspectRatios =
    availableAspectRatios.length > 0
      ? availableAspectRatios
      : [...DEFAULT_GENERATION_ASPECT_RATIOS];

  const resolvedDefaultAspectRatio = model
    ? getDefaultAspectRatioFromModel(model)
    : resolvedAspectRatios[0];
  const defaultAspectRatio = resolvedAspectRatios.includes(
    resolvedDefaultAspectRatio,
  )
    ? resolvedDefaultAspectRatio
    : resolvedAspectRatios[0];

  if (generationType !== 'video') {
    return {
      availableAspectRatios: resolvedAspectRatios,
      defaultAspectRatio,
      durationOptions: [],
      showDuration: false,
    };
  }

  const capability = model ? getModelCapability(model) : null;
  const durationOptionsFromModel =
    model?.durations && model.durations.length > 0
      ? [...model.durations]
      : model
        ? [...getModelDurations(model.key as ModelKey)]
        : [];
  const durationOptions =
    durationOptionsFromModel.length > 0
      ? durationOptionsFromModel
      : [...DEFAULT_VIDEO_DURATION_OPTIONS];

  const capabilityHasDurationEditing =
    capability &&
    'hasDurationEditing' in capability &&
    typeof capability.hasDurationEditing === 'boolean'
      ? capability.hasDurationEditing
      : undefined;
  const showDuration =
    model?.hasDurationEditing ?? capabilityHasDurationEditing ?? true;

  const capabilityDefaultDuration =
    capability &&
    'defaultDuration' in capability &&
    typeof capability.defaultDuration === 'number'
      ? capability.defaultDuration
      : undefined;
  const defaultDuration = model
    ? (model.defaultDuration ??
      capabilityDefaultDuration ??
      getModelDefaultDuration(model.key as ModelKey) ??
      durationOptions[0])
    : durationOptions[0];

  return {
    availableAspectRatios: resolvedAspectRatios,
    defaultAspectRatio,
    defaultDuration,
    durationOptions,
    showDuration,
  };
}

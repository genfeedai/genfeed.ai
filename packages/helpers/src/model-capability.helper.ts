import {
  type EmbeddingModelCapability,
  type ImageEditModelCapability,
  type ImageModelCapability,
  type ImageUpscaleModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
  type ModelOutputCapability,
  type MusicModelCapability,
  type TextModelCapability,
  type VideoEditModelCapability,
  type VideoModelCapability,
  type VideoUpscaleModelCapability,
  type VoiceModelCapability,
} from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';

const DEFAULT_MAX_OUTPUTS = 4;
const DEFAULT_MAX_REFERENCES = 1;

function buildBaseFields(model: IModel) {
  return {
    isBatchSupported: model.isBatchSupported ?? false,
    maxOutputs: model.maxOutputs ?? DEFAULT_MAX_OUTPUTS,
    maxReferences: model.maxReferences ?? DEFAULT_MAX_REFERENCES,
  };
}

function buildImageCapability(model: IModel): ImageModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.IMAGE,
    ...(model.isReferencesMandatory != null && {
      isReferencesMandatory: model.isReferencesMandatory,
    }),
    ...(model.isImagenModel != null && {
      isImagenModel: model.isImagenModel,
    }),
    ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
    ...(model.defaultAspectRatio != null && {
      defaultAspectRatio: model.defaultAspectRatio,
    }),
  };
}

function buildVideoCapability(model: IModel): VideoModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.VIDEO,
    ...(model.hasEndFrame != null && { hasEndFrame: model.hasEndFrame }),
    ...(model.hasInterpolation != null && {
      hasInterpolation: model.hasInterpolation,
    }),
    ...(model.hasSpeech != null && { hasSpeech: model.hasSpeech }),
    ...(model.hasAudioToggle != null && {
      hasAudioToggle: model.hasAudioToggle,
    }),
    ...(model.hasDurationEditing != null && {
      hasDurationEditing: model.hasDurationEditing,
    }),
    ...(model.hasResolutionOptions != null && {
      hasResolutionOptions: model.hasResolutionOptions,
    }),
    ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
    ...(model.defaultAspectRatio != null && {
      defaultAspectRatio: model.defaultAspectRatio,
    }),
    ...(model.usesOrientation != null && {
      usesOrientation: model.usesOrientation,
    }),
    ...(model.durations != null && { durations: model.durations }),
    ...(model.defaultDuration != null && {
      defaultDuration: model.defaultDuration,
    }),
  };
}

function buildImageEditCapability(model: IModel): ImageEditModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.IMAGE_EDIT,
    ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
    ...(model.defaultAspectRatio != null && {
      defaultAspectRatio: model.defaultAspectRatio,
    }),
  };
}

function buildVideoEditCapability(model: IModel): VideoEditModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.VIDEO_EDIT,
    ...(model.hasDurationEditing != null && {
      hasDurationEditing: model.hasDurationEditing,
    }),
    ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
    ...(model.defaultAspectRatio != null && {
      defaultAspectRatio: model.defaultAspectRatio,
    }),
    ...(model.durations != null && { durations: model.durations }),
    ...(model.defaultDuration != null && {
      defaultDuration: model.defaultDuration,
    }),
  };
}

function buildMusicCapability(model: IModel): MusicModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.MUSIC,
    ...(model.hasDurationEditing != null && {
      hasDurationEditing: model.hasDurationEditing,
    }),
    ...(model.durations != null && { durations: model.durations }),
    ...(model.defaultDuration != null && {
      defaultDuration: model.defaultDuration,
    }),
  };
}

function buildVoiceCapability(model: IModel): VoiceModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.VOICE,
    ...(model.hasDurationEditing != null && {
      hasDurationEditing: model.hasDurationEditing,
    }),
    ...(model.aspectRatios != null && { aspectRatios: model.aspectRatios }),
    ...(model.defaultAspectRatio != null && {
      defaultAspectRatio: model.defaultAspectRatio,
    }),
    ...(model.durations != null && { durations: model.durations }),
    ...(model.defaultDuration != null && {
      defaultDuration: model.defaultDuration,
    }),
  };
}

function buildTextCapability(model: IModel): TextModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.TEXT,
  };
}

function buildEmbeddingCapability(model: IModel): EmbeddingModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.EMBEDDING,
  };
}

function buildImageUpscaleCapability(
  model: IModel,
): ImageUpscaleModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.IMAGE_UPSCALE,
  };
}

function buildVideoUpscaleCapability(
  model: IModel,
): VideoUpscaleModelCapability {
  return {
    ...buildBaseFields(model),
    category: ModelCategory.VIDEO_UPSCALE,
  };
}

const CATEGORY_BUILDERS: Record<
  string,
  (model: IModel) => ModelOutputCapability
> = {
  [ModelCategory.IMAGE]: buildImageCapability,
  [ModelCategory.VIDEO]: buildVideoCapability,
  [ModelCategory.IMAGE_EDIT]: buildImageEditCapability,
  [ModelCategory.VIDEO_EDIT]: buildVideoEditCapability,
  [ModelCategory.MUSIC]: buildMusicCapability,
  [ModelCategory.VOICE]: buildVoiceCapability,
  [ModelCategory.TEXT]: buildTextCapability,
  [ModelCategory.EMBEDDING]: buildEmbeddingCapability,
  [ModelCategory.IMAGE_UPSCALE]: buildImageUpscaleCapability,
  [ModelCategory.VIDEO_UPSCALE]: buildVideoUpscaleCapability,
};

/**
 * Build a ModelOutputCapability from DB fields on the IModel document.
 * Returns null if the model has no capability fields populated (maxOutputs is undefined).
 */
export function getModelCapabilityFromDoc(
  model: IModel,
): ModelOutputCapability | null {
  if (model.maxOutputs == null) {
    return null;
  }

  const builder = CATEGORY_BUILDERS[model.category];

  if (!builder) {
    return null;
  }

  return builder(model);
}

/**
 * Get capability from DB fields first, falling back to the static constant.
 */
export function getModelCapability(
  model: IModel,
): ModelOutputCapability | null {
  return (
    getModelCapabilityFromDoc(model) ??
    MODEL_OUTPUT_CAPABILITIES[model.key] ??
    null
  );
}

/**
 * Get capability by model key string. If an IModel document is provided,
 * uses DB fields with constant fallback. Otherwise looks up the static constant only.
 */
export function getModelCapabilityByKey(
  modelKey: string,
  model?: IModel,
): ModelOutputCapability | null {
  if (model) {
    return getModelCapability(model);
  }

  return MODEL_OUTPUT_CAPABILITIES[modelKey as string] ?? null;
}

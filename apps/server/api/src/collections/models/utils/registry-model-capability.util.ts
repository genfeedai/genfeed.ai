import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import {
  ModelCategory,
  type ModelLifecycle,
  type ModelProvider,
} from '@genfeedai/contracts';
import {
  getModelMaxVideoReferences,
  hasNativeExtend,
  hasVideoReferences,
  type ModelOutputCapability,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { getModelCapability } from '@genfeedai/helpers/model-capability.helper';

const MODEL_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(ModelCategory),
);

function isModelCategory(value: string): value is ModelCategory {
  return MODEL_CATEGORIES.has(value);
}

/** The registry row in the `IModel` shape the capability helper reads. */
export function toCapabilityModel(
  model: ModelDocument,
  category: ModelCategory,
): IModel {
  return {
    id: model.id,
    key: model.key,
    label: model.label,
    category,
    provider: model.provider as ModelProvider,
    lifecycle: model.lifecycle as ModelLifecycle,
    cost: model.cost,
    isActive: model.isActive,
    isDefault: model.isDefault,
    isDeleted: model.isDeleted,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
    maxOutputs: model.maxOutputs ?? undefined,
    maxReferences: model.maxReferences ?? undefined,
    aspectRatios: model.aspectRatios ?? undefined,
    defaultAspectRatio: model.defaultAspectRatio ?? undefined,
    durations: model.durations ?? undefined,
    defaultDuration: model.defaultDuration ?? undefined,
    hasInterpolation: model.hasInterpolation ?? undefined,
    hasEndFrame: model.hasEndFrame ?? undefined,
    hasSpeech: model.hasSpeech ?? undefined,
    hasAudioToggle: model.hasAudioToggle ?? undefined,
    hasDurationEditing: model.hasDurationEditing ?? undefined,
    hasResolutionOptions: model.hasResolutionOptions ?? undefined,
  };
}

/**
 * Capability of a registry row: catalog fields first, the static constant as
 * fallback. Video reference and native-extend support have no catalog column
 * yet, so they come from the same key-based lookups video generation admission
 * uses (`video-generation-preparation.service.ts`).
 */
export function getRegistryModelCapability(
  model: ModelDocument,
): ModelOutputCapability | null {
  const category = String(model.category);
  if (!isModelCategory(category)) return null;

  const capability = getModelCapability(toCapabilityModel(model, category));
  if (!capability || capability.category !== ModelCategory.VIDEO) {
    return capability;
  }

  return {
    ...capability,
    hasNativeExtend: hasNativeExtend(model.key),
    hasVideoReferences: hasVideoReferences(model.key),
    maxVideoReferences: getModelMaxVideoReferences(model.key),
  };
}

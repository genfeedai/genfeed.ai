import { ModelCategory } from '..';

import {
  type ImageModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
  type ModelOutputCapability,
  type VideoModelCapability,
} from './model-capabilities.constant';

const DURATION_CATEGORIES = new Set([
  ModelCategory.VIDEO,
  ModelCategory.VIDEO_EDIT,
  ModelCategory.MUSIC,
  ModelCategory.VOICE,
]);

const DURATION_WITH_OPTIONS_CATEGORIES = new Set([
  ModelCategory.VIDEO,
  ModelCategory.MUSIC,
  ModelCategory.VOICE,
]);

/**
 * Resolve capability from an optional pre-built capability object or the static constant.
 * When consumers pass a DB-built capability (from getModelCapability), it takes priority.
 */
function resolveCapability(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): ModelOutputCapability | undefined {
  return capability ?? MODEL_OUTPUT_CAPABILITIES[modelKey as string];
}

export function getModelMaxOutputs(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): number {
  const cap = resolveCapability(modelKey, capability);
  return cap?.maxOutputs ?? 4;
}

export function supportsMultipleOutputs(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  return getModelMaxOutputs(modelKey, capability) > 1;
}

export function getModelMaxReferences(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): number {
  const cap = resolveCapability(modelKey, capability);
  return cap?.maxReferences ?? 1;
}

export function supportsMultipleReferences(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  return getModelMaxReferences(modelKey, capability) > 1;
}

export function isReferencesMandatory(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.IMAGE) {
    return false;
  }
  return (cap as ImageModelCapability).isReferencesMandatory ?? false;
}

export function hasEndFrame(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return cap.hasEndFrame ?? false;
}

export function hasNativeExtend(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasNativeExtend ?? false;
}

export function requiresFirstFrame(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).requiresFirstFrame ?? false;
}

export function hasVideoReferences(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasVideoReferences ?? false;
}

export function getModelMaxVideoReferences(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): number {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return 0;
  }
  const videoCapability = cap as VideoModelCapability;
  return videoCapability.hasVideoReferences
    ? (videoCapability.maxVideoReferences ?? 1)
    : 0;
}

export function hasSpeech(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasSpeech ?? false;
}

export function hasAudioToggle(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasAudioToggle ?? false;
}

export function hasDurationEditing(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap) {
    return true;
  }
  if (!DURATION_CATEGORIES.has(cap.category)) {
    return false;
  }
  return (cap as VideoModelCapability).hasDurationEditing ?? true;
}

export function hasResolutionOptions(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasResolutionOptions ?? false;
}

export function isImagenModel(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.IMAGE) {
    return false;
  }
  return (cap as ImageModelCapability).isImagenModel ?? false;
}

export function hasAnyEndFrame(modelKeys: string[]): boolean {
  return modelKeys.some((key) => hasEndFrame(key));
}

export function hasInterpolation(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): boolean {
  const cap = resolveCapability(modelKey, capability);
  if (!cap || cap.category !== ModelCategory.VIDEO) {
    return false;
  }
  return (cap as VideoModelCapability).hasInterpolation ?? false;
}

export function hasAnyInterpolation(modelKeys: string[]): boolean {
  return modelKeys.some((key) => hasInterpolation(key));
}

export function hasAnySpeech(modelKeys: string[]): boolean {
  return modelKeys.some((key) => hasSpeech(key));
}

export function hasAnyAudioToggle(modelKeys: string[]): boolean {
  return modelKeys.some((key) => hasAudioToggle(key));
}

export function hasAnyResolutionOptions(modelKeys: string[]): boolean {
  return modelKeys.some((key) => hasResolutionOptions(key));
}

export function hasAnyImagenModel(modelKeys: string[]): boolean {
  return modelKeys.some((key) => isImagenModel(key));
}

export function isOnlyImagenModels(modelKeys: string[]): boolean {
  if (modelKeys.length === 0) {
    return false;
  }
  return modelKeys.every((key) => isImagenModel(key));
}

export function hasModelWithoutDurationEditing(modelKeys: string[]): boolean {
  return modelKeys.some((key) => !hasDurationEditing(key));
}

export function getModelDurations(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): readonly number[] {
  const cap = resolveCapability(modelKey, capability);
  if (!cap) {
    return [];
  }
  if (!DURATION_WITH_OPTIONS_CATEGORIES.has(cap.category)) {
    return [];
  }
  return (cap as VideoModelCapability).durations ?? [];
}

/** Clip lengths a provider allows per resolution, keyed by resolution label. */
export type DurationsByResolution = Readonly<Record<string, readonly number[]>>;

/**
 * Narrows `durations` to the lengths a provider allows at `resolution`.
 * Resolution labels compare case-insensitively (`768p` and `768P` are one
 * resolution). Without a resolution, or for one the provider does not cap,
 * every duration applies; when no offered length survives the cap, the cap
 * itself is the answer.
 */
export function narrowDurationsByResolution(
  durations: readonly number[],
  byResolution: DurationsByResolution | null | undefined,
  resolution?: string | null,
): readonly number[] {
  if (!resolution || !byResolution) return durations;
  const wanted = resolution.toLowerCase();
  const capped = Object.entries(byResolution).find(
    ([label]) => label.toLowerCase() === wanted,
  )?.[1];
  if (!capped) return durations;
  const allowed = durations.filter((duration) => capped.includes(duration));
  return allowed.length > 0 ? allowed : capped;
}

/**
 * The per-resolution clip-length caps for a model. Limits read live from the
 * provider's reviewed rates (`liveByResolution`) win over the static
 * capability, which is the fallback for a model with no reviewed rates. Keys
 * are lowercase.
 */
export function getModelDurationLimits(
  modelKey: string,
  liveByResolution?: DurationsByResolution | null,
  capability?: ModelOutputCapability | null,
): DurationsByResolution {
  const cap = resolveCapability(modelKey, capability);
  const staticLimits =
    cap && DURATION_WITH_OPTIONS_CATEGORIES.has(cap.category)
      ? (cap as VideoModelCapability).durationsByResolution
      : undefined;
  return Object.fromEntries(
    [staticLimits, liveByResolution].flatMap((limits) =>
      Object.entries(limits ?? {}).map(
        ([label, lengths]) => [label.toLowerCase(), lengths] as const,
      ),
    ),
  );
}

/**
 * The clip lengths a model offers at a resolution: its `durations`, narrowed
 * to the provider's cap for that resolution when one is declared. Without a
 * resolution, or for a resolution with no cap, every duration applies.
 */
export function getModelDurationsForResolution(
  modelKey: string,
  resolution?: string | null,
  capability?: ModelOutputCapability | null,
  liveByResolution?: DurationsByResolution | null,
): readonly number[] {
  return narrowDurationsByResolution(
    getModelDurations(modelKey, capability),
    getModelDurationLimits(modelKey, liveByResolution, capability),
    resolution,
  );
}

export function getModelDefaultDuration(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): number | undefined {
  const cap = resolveCapability(modelKey, capability);
  if (!cap) {
    return undefined;
  }
  if (!DURATION_WITH_OPTIONS_CATEGORIES.has(cap.category)) {
    return undefined;
  }
  return (cap as VideoModelCapability).defaultDuration;
}

export function getModelMinDuration(
  modelKey: string,
  capability?: ModelOutputCapability | null,
): number | undefined {
  const durations = getModelDurations(modelKey, capability);
  return durations.length > 0 ? durations[0] : undefined;
}

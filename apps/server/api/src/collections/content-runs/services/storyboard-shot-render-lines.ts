import type { StoryboardStoredRunConfig } from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  latestShotRender,
  shotRenderInputFingerprint,
  snapShotRenderDuration,
} from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { getRegistryModelCapability } from '@api/collections/models/utils/registry-model-capability.util';
import { ModelCategory } from '@genfeedai/contracts';
import type { StoryboardShot } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { compileStoryboardShotPrompt } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-prompt.contract';
import type { StoryboardShotRenderStage } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import type { VideoModelCapability } from '@genfeedai/contracts/constants';
import {
  getDefaultVideoResolution,
  getVideoResolutionsByModel,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** The model, settings and limits one stage renders with. */
export interface StageModel {
  modelKey: string;
  provider: string;
  durations: readonly number[];
  resolution?: string;
  /** Sent to the provider only when the model has an audio switch. */
  audio: { isEnabled: boolean; hasToggle: boolean };
  /**
   * The final model renders sound, so the prompt carries the spoken line and
   * sound effects at both stages: a draft is promoted with its exact prompt.
   */
  isPromptWithSound: boolean;
  maxReferences: number;
}

/** One shot's priced render input. */
export interface RenderLine {
  shotId: string;
  credits: number;
  inputFingerprint: string;
  prompt: string;
  referenceAssetIds: string[];
  durationSeconds: number;
  promotedFromOperationId?: string;
}

export function videoCapability(
  model: Parameters<typeof getRegistryModelCapability>[0] | null,
): VideoModelCapability | null {
  if (!model) return null;
  const capability = getRegistryModelCapability(model);
  return capability?.category === ModelCategory.VIDEO ? capability : null;
}

/** One shot's render input: a promoted draft's, else freshly compiled. */
export function shotRenderLine(
  config: StoryboardStoredRunConfig,
  shot: StoryboardShot,
  stage: StoryboardShotRenderStage,
  model: StageModel,
): Omit<RenderLine, 'credits'> {
  const { plan } = config;
  const inputFingerprint = shotRenderInputFingerprint(plan, shot, stage);
  const durationSeconds =
    stage === 'draft'
      ? Math.min(...model.durations)
      : snapShotRenderDuration(shot.durationSeconds ?? 0, model.durations);
  if (!durationSeconds || !Number.isFinite(durationSeconds))
    throw new ConflictException(
      `The ${stage} model has no clip length for shot ${shot.ordinal}.`,
    );
  const draft =
    stage === 'final'
      ? latestShotRender(config.shotRenderOperations, shot.id, 'draft')
      : undefined;
  if (
    draft?.state === 'ready' &&
    draft.inputFingerprint === shotRenderInputFingerprint(plan, shot, 'draft')
  ) {
    if (draft.referenceAssetIds.length > model.maxReferences)
      throw new BadRequestException(
        `The final model accepts ${model.maxReferences} references; the draft of shot ${shot.ordinal} used ${draft.referenceAssetIds.length}.`,
      );
    return {
      shotId: shot.id,
      inputFingerprint,
      prompt: draft.prompt,
      referenceAssetIds: draft.referenceAssetIds,
      durationSeconds,
      promotedFromOperationId: draft.operationId,
    };
  }
  const compiled = compileStoryboardShotPrompt(plan, shot, {
    isAudioEnabled: model.isPromptWithSound,
    maxReferences: model.maxReferences,
  });
  if (compiled.namedReferenceCount > model.maxReferences)
    throw new BadRequestException(
      `Shot ${shot.ordinal} names ${compiled.namedReferenceCount} reference images; ${model.modelKey} accepts ${model.maxReferences}. Remove a reference role or choose another model.`,
    );
  return {
    shotId: shot.id,
    inputFingerprint,
    prompt: compiled.prompt,
    referenceAssetIds: compiled.referenceAssetIds,
    durationSeconds,
  };
}

/** The settings a stage renders a model with. */
export function shotRenderStageModel(
  stage: StoryboardShotRenderStage,
  modelKey: string,
  provider: string,
  capability: VideoModelCapability,
  durations: readonly number[],
  finalCapability: VideoModelCapability,
): StageModel {
  const resolution =
    stage === 'draft'
      ? getVideoResolutionsByModel(modelKey)[0]?.value
      : getDefaultVideoResolution(modelKey);
  const allowed =
    (resolution
      ? capability.durationsByResolution?.[resolution.toLowerCase()]
      : undefined) ?? durations;
  const hasToggle = Boolean(capability.hasAudioToggle);
  return {
    modelKey,
    provider,
    durations: durations.filter((value) => allowed.includes(value)),
    ...(resolution ? { resolution } : {}),
    audio: { isEnabled: stage === 'final' && hasToggle, hasToggle },
    isPromptWithSound: Boolean(
      finalCapability.hasAudioToggle || finalCapability.hasSpeech,
    ),
    maxReferences: Math.max(0, capability.maxReferences),
  };
}

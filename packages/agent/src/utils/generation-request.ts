import { RouterPriority } from '@genfeedai/contracts';
import { resolveAgentGenerationDimensions } from '@genfeedai/contracts/constants';
import type {
  AgentClipRunIdentity,
  GenerationExecutionDimensions,
} from '@genfeedai/contracts/interfaces';

export const DEFAULT_AGENT_GENERATION_PRIORITY = RouterPriority.QUALITY;

export function getPromptCategoryForGenerationType(
  generationType: 'image' | 'video',
): 'models-prompt-image' | 'models-prompt-video' {
  return generationType === 'video'
    ? 'models-prompt-video'
    : 'models-prompt-image';
}

/** #4813 Same table the Agent tool and the pre-review quote resolve through. */
export function getDimensionsForAspectRatio(
  ratio: string,
): GenerationExecutionDimensions {
  return resolveAgentGenerationDimensions(ratio);
}

export function buildAgentGenerationRequestBody({
  aspectRatio,
  brandId,
  duration,
  endFrame,
  identity,
  modelKey,
  outputs,
  prioritize = DEFAULT_AGENT_GENERATION_PRIORITY,
  promptId,
  promptText,
  references,
  resolution,
  videoReferences,
  waitForCompletion,
}: {
  aspectRatio: string;
  brandId?: string;
  duration?: number;
  endFrame?: string;
  identity?: AgentClipRunIdentity;
  modelKey?: string;
  outputs?: number;
  prioritize?: RouterPriority;
  promptId: string;
  promptText: string;
  /** Source ingredient IDs used as image/video references. */
  references?: string[];
  resolution?: string;
  videoReferences?: string[];
  waitForCompletion?: boolean;
}): Record<string, unknown> {
  const { width, height } = getDimensionsForAspectRatio(aspectRatio);
  const body: Record<string, unknown> = {
    autoSelectModel: !modelKey,
    height,
    prioritize,
    promptId,
    text: promptText,
    width,
  };

  if (brandId) {
    body.brandId = brandId;
  }

  if (modelKey) {
    body.model = modelKey;
  }

  if (duration != null) {
    body.duration = duration;
  }

  if (endFrame) {
    body.endFrame = endFrame;
  }

  if (resolution) {
    body.resolution = resolution;
  }

  if (outputs != null && Number.isFinite(outputs) && outputs >= 1) {
    body.outputs = Math.min(8, Math.round(outputs));
  }

  if (waitForCompletion != null) {
    body.waitForCompletion = waitForCompletion;
  }

  if (references && references.length > 0) {
    body.references = references;
  }

  if (videoReferences && videoReferences.length > 0) {
    body.videoReferences = videoReferences;
  }

  if (identity?.avatarId) {
    body.avatarId = identity.avatarId;
    body.avatarProvider = identity.avatarProvider ?? 'heygen';
    body.useIdentity = true;

    if ((identity.avatarProvider ?? 'heygen') === 'heygen') {
      body.heygenAvatarId = identity.avatarId;
    }
  }

  if (identity?.voiceId) {
    body.voiceId = identity.voiceId;
    body.voiceProvider = identity.voiceProvider ?? 'heygen';
    body.useIdentity = true;

    if ((identity.voiceProvider ?? 'heygen') === 'heygen') {
      body.heygenVoiceId = identity.voiceId;
    }
  }

  return body;
}

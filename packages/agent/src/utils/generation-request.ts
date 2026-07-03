import { RouterPriority } from '@genfeedai/enums';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';

export const DEFAULT_AGENT_GENERATION_PRIORITY = RouterPriority.QUALITY;

const ASPECT_RATIO_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  '1:1': { height: 1024, width: 1024 },
  '3:4': { height: 1365, width: 1024 },
  '4:3': { height: 768, width: 1024 },
  '9:16': { height: 1024, width: 576 },
  '16:9': { height: 576, width: 1024 },
};

export function getPromptCategoryForGenerationType(
  generationType: 'image' | 'video',
): 'models-prompt-image' | 'models-prompt-video' {
  return generationType === 'video'
    ? 'models-prompt-video'
    : 'models-prompt-image';
}

export function getDimensionsForAspectRatio(ratio: string): {
  width: number;
  height: number;
} {
  return ASPECT_RATIO_DIMENSIONS[ratio] ?? ASPECT_RATIO_DIMENSIONS['1:1'];
}

export function buildAgentGenerationRequestBody({
  aspectRatio,
  duration,
  identity,
  modelKey,
  prioritize = DEFAULT_AGENT_GENERATION_PRIORITY,
  promptId,
  promptText,
  waitForCompletion,
}: {
  aspectRatio: string;
  duration?: number;
  identity?: AgentClipRunIdentity;
  modelKey?: string;
  prioritize?: RouterPriority;
  promptId: string;
  promptText: string;
  waitForCompletion?: boolean;
}): Record<string, unknown> {
  const { width, height } = getDimensionsForAspectRatio(aspectRatio);
  const body: Record<string, unknown> = {
    autoSelectModel: !modelKey,
    height,
    prioritize,
    prompt: promptId,
    text: promptText,
    width,
  };

  if (modelKey) {
    body.model = modelKey;
  }

  if (duration != null) {
    body.duration = duration;
  }

  if (waitForCompletion != null) {
    body.waitForCompletion = waitForCompletion;
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

import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  KlingAvatarV2Input,
  KlingMasterInput,
  KlingO1Input,
  KlingV3OmniVideoInput,
  KlingV3VideoInput,
  KlingV16ProInput,
  KlingV21Input,
  KlingV26Input,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import {
  calculateAspectRatio,
  normalizeAspectRatioForModel,
} from '@genfeedai/helpers';

type KlingVideoMode = 'pro' | 'standard';

export function buildKlingV21Prompt(
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
): KlingV21Input {
  if (!params.references || params.references.length === 0) {
    throw new Error(
      'start_image is required for Kling V2.1 model. Please provide a reference image.',
    );
  }

  const allowedDurations = [5, 10];
  const duration =
    params.duration && allowedDurations.includes(params.duration)
      ? params.duration
      : 5;

  const mode = params.endFrame ? 'pro' : 'standard';

  const input: KlingV21Input = {
    duration: duration,
    mode: mode,
    prompt: promptText,
    start_image: params.references[0],
  };

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (params.endFrame) {
    input.end_image = params.endFrame;
  }

  return input;
}

export function buildKlingMasterPrompt(
  model: string,
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
): KlingMasterInput {
  const calculatedRatio = calculateAspectRatio(params.width, params.height);
  const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

  const allowedDurations = [5, 10];
  const duration =
    params.duration && allowedDurations.includes(params.duration)
      ? params.duration
      : 5;

  const input: KlingMasterInput = {
    aspect_ratio: aspectRatio,
    duration: duration,
    prompt: promptText,
  };

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (params.references && params.references.length > 0) {
    input.start_image = params.references[0];
  }

  return input;
}

export function buildKlingV16ProPrompt(
  model: string,
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
): KlingV16ProInput {
  const calculatedRatio = calculateAspectRatio(params.width, params.height);
  const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

  const allowedDurations = [5, 10];
  const duration =
    params.duration && allowedDurations.includes(params.duration)
      ? params.duration
      : 5;

  const input: KlingV16ProInput = {
    aspect_ratio: aspectRatio,
    duration: duration,
    prompt: promptText,
  };

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (params.references && params.references.length > 0) {
    input.start_image = params.references[0];
  }

  if (params.endFrame) {
    input.end_image = params.endFrame;
  }

  if (params.references && params.references.length > 1) {
    input.reference_images = params.references.slice(1, 5);
  }

  return input;
}

export function buildKlingV3Prompt(
  model: string,
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
  mode: KlingVideoMode,
): KlingV3VideoInput {
  const calculatedRatio = calculateAspectRatio(params.width, params.height);
  const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

  const duration = Math.min(Math.max(params.duration ?? 5, 3), 15);

  const input: KlingV3VideoInput = {
    aspect_ratio: aspectRatio,
    duration: duration,
    mode: mode,
    prompt: promptText,
  };

  if (params.isAudioEnabled !== undefined) {
    input.generate_audio = params.isAudioEnabled;
  }

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (params.references && params.references.length > 0) {
    input.start_image = params.references[0];
  }

  if (params.endFrame) {
    input.end_image = params.endFrame;
  }

  return input;
}

export function buildKlingV3OmniPrompt(
  model: string,
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
  mode: KlingVideoMode,
): KlingV3OmniVideoInput {
  const calculatedRatio = calculateAspectRatio(params.width, params.height);
  const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

  const duration = Math.min(Math.max(params.duration ?? 5, 3), 15);

  const input: KlingV3OmniVideoInput = {
    aspect_ratio: aspectRatio,
    duration: duration,
    mode: mode,
    prompt: promptText,
  };

  if (params.isAudioEnabled !== undefined) {
    input.generate_audio = params.isAudioEnabled;
  }

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  // Reference images: up to 7
  if (params.references && params.references.length > 1) {
    input.reference_images = params.references.slice(0, 7);
  } else if (params.references && params.references.length === 1) {
    input.start_image = params.references[0];
  }

  if (params.endFrame) {
    input.end_image = params.endFrame;
  }

  if (params.video) {
    input.reference_video = params.video;
    input.video_reference_type = 'feature';
  }

  return input;
}

export function buildKlingAvatarV2Prompt(
  params: PromptBuilderParams,
  promptText: string,
): KlingAvatarV2Input {
  if (!params.references || params.references.length === 0) {
    throw new Error(
      'Portrait image is required for Kling Avatar V2. Please provide a reference image.',
    );
  }

  if (!params.audioUrl) {
    throw new Error(
      'Audio file is required for Kling Avatar V2. Please provide an audio URL.',
    );
  }

  const input: KlingAvatarV2Input = {
    audio: params.audioUrl,
    image: params.references[0],
  };

  if (promptText) {
    input.prompt = promptText;
  }

  return input;
}

export function buildKlingV26Prompt(
  model: string,
  params: PromptBuilderParams,
  promptText: string,
  negativePrompt: string,
): KlingV26Input {
  const calculatedRatio = calculateAspectRatio(params.width, params.height);
  const aspectRatio = normalizeAspectRatioForModel(model, calculatedRatio);

  const allowedDurations = [5, 10];
  const duration =
    params.duration && allowedDurations.includes(params.duration)
      ? params.duration
      : 5;

  const input: KlingV26Input = {
    aspect_ratio: aspectRatio,
    duration: duration,
    prompt: promptText,
  };

  if (params.isAudioEnabled !== undefined) {
    input.generate_audio = params.isAudioEnabled;
  }

  if (negativePrompt) {
    input.negative_prompt = negativePrompt;
  }

  if (params.references && params.references.length > 0) {
    input.start_image = params.references[0];
  }

  if (params.seed !== undefined) {
    input.seed = params.seed;
  }

  return input;
}

export function buildKlingO1Prompt(
  params: PromptBuilderParams,
  promptText: string,
): KlingO1Input {
  const duration = Math.min(Math.max(params.duration ?? 5, 3), 10);

  const input: KlingO1Input = {
    duration: duration,
    prompt: promptText,
  };

  if (params.references && params.references.length > 0) {
    input.reference_images = params.references.slice(0, 4);
  }

  if (params.seed !== undefined) {
    input.seed = params.seed;
  }

  return input;
}

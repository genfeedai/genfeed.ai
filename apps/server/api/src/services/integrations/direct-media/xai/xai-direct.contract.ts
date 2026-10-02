import {
  type DirectMediaInput,
  type DirectMediaModelContract,
  DirectMediaProviderError,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';

const CONTRACT_VERSION = 'xai-imagine-2026-10-02';
const IMAGE_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '2:1',
  '1:2',
  '19.5:9',
  '9:19.5',
  '20:9',
  '9:20',
  '21:9',
  '5:2',
  'auto',
];
const VIDEO_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const INPUT_FIELDS = new Set([
  'model',
  'mode',
  'prompt',
  'references',
  'width',
  'height',
  'aspectRatio',
  'durationSeconds',
  'resolution',
  'seed',
]);

export const XAI_DIRECT_MODELS: readonly DirectMediaModelContract[] = [
  {
    provider: 'xai',
    model: 'grok-imagine-image-2.0',
    modes: ['text-to-image', 'image-edit'],
    contractVersion: CONTRACT_VERSION,
    sourceUrls: [
      'https://docs.x.ai/developers/model-capabilities/images/generation',
      'https://docs.x.ai/developers/model-capabilities/images/editing',
      'https://docs.x.ai/developers/model-capabilities/images/multi-image-editing',
      'https://docs.x.ai/developers/rest-api-reference/inference/images.md',
    ],
    maxReferences: 5,
    cancellation: 'unsupported',
  },
  {
    provider: 'xai',
    model: 'grok-imagine-video-1.5',
    modes: ['text-to-video', 'image-to-video'],
    contractVersion: CONTRACT_VERSION,
    sourceUrls: [
      'https://docs.x.ai/developers/model-capabilities/video/generation',
      'https://docs.x.ai/developers/model-capabilities/video/image-to-video',
      'https://docs.x.ai/developers/rest-api-reference/inference/videos.md',
    ],
    maxReferences: 1,
    cancellation: 'unsupported',
  },
];

function invalidInput(): never {
  throw new DirectMediaProviderError(
    'PROVIDER_INPUT_INVALID',
    'Unsupported direct xAI media input.',
  );
}

/** References still require upstream tenant asset admission; URL shape alone is insufficient. */
export function compileXaiDirectRequest(
  input: DirectMediaInput,
): PreparedDirectMediaRequest {
  const contract = XAI_DIRECT_MODELS.find(
    (entry) => entry.model === input.model,
  );
  if (
    !contract?.modes.includes(input.mode) ||
    Object.keys(input).some((key) => !INPUT_FIELDS.has(key))
  )
    invalidInput();
  if (
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    !Array.isArray(input.references)
  )
    invalidInput();
  if (
    input.width !== undefined ||
    input.height !== undefined ||
    input.seed !== undefined
  )
    invalidInput();
  const isVideo = input.model === 'grok-imagine-video-1.5';
  const hasReferences =
    input.mode === 'image-edit' || input.mode === 'image-to-video';
  if (
    hasReferences
      ? input.references.length < 1 ||
        input.references.length > contract.maxReferences
      : input.references.length !== 0
  )
    invalidInput();
  const references = input.references.map((reference) => {
    if (
      !reference ||
      typeof reference.url !== 'string' ||
      Object.keys(reference).some((key) => key !== 'url' && key !== 'mimeType')
    )
      invalidInput();
    try {
      const url = new URL(reference.url);
      if (url.protocol !== 'https:' || url.username || url.password)
        invalidInput();
    } catch {
      invalidInput();
    }
    if (
      reference.mimeType !== undefined &&
      !['image/jpeg', 'image/png', 'image/webp'].includes(reference.mimeType)
    )
      invalidInput();
    return { url: reference.url, type: 'image_url' };
  });
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  if (input.aspectRatio !== undefined) {
    if (!(isVideo ? VIDEO_RATIOS : IMAGE_RATIOS).includes(input.aspectRatio))
      invalidInput();
    body.aspect_ratio = input.aspectRatio;
  }
  if (input.resolution !== undefined) {
    if (
      !(isVideo ? ['480p', '720p', '1080p'] : ['1k', '2k']).includes(
        input.resolution,
      )
    )
      invalidInput();
    body.resolution = input.resolution;
  }
  if (input.durationSeconds !== undefined) {
    if (
      !isVideo ||
      !Number.isInteger(input.durationSeconds) ||
      input.durationSeconds < 1 ||
      input.durationSeconds > 15
    )
      invalidInput();
    body.duration = input.durationSeconds;
  }
  if (hasReferences) {
    if (references.length === 1) body.image = references[0];
    else body.images = references;
  }
  return {
    provider: 'xai',
    model: input.model,
    mode: input.mode,
    contractVersion: contract.contractVersion,
    endpoint: isVideo
      ? 'https://api.x.ai/v1/videos/generations'
      : input.mode === 'image-edit'
        ? 'https://api.x.ai/v1/images/edits'
        : 'https://api.x.ai/v1/images/generations',
    body,
  };
}

import {
  type DirectMediaInput,
  type DirectMediaModelContract,
  DirectMediaProviderError,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';

const VERSION = '2024-11-06';
const VIDEO_RATIOS = ['1280:720', '720:1280'];
const FRAME_RATIOS = [
  ...VIDEO_RATIOS,
  '1104:832',
  '960:960',
  '832:1104',
  '1584:672',
];
const IMAGE_RATIOS = [
  '1024:1024',
  '1080:1080',
  '1168:880',
  '1360:768',
  '1440:1080',
  '1080:1440',
  '1808:768',
  '1920:1080',
  '1080:1920',
  '2112:912',
  '1280:720',
  '720:1280',
  '720:720',
  '960:720',
  '720:960',
  '1680:720',
];
export const RUNWAY_DIRECT_MODELS: readonly DirectMediaModelContract[] = [
  {
    provider: 'runway',
    model: 'gen4.5',
    modes: ['text-to-video', 'image-to-video'],
    contractVersion: VERSION,
    sourceUrls: [
      'https://docs.dev.runwayml.com/api.md',
      'https://docs.dev.runwayml.com/guides/models/',
    ],
    maxReferences: 1,
    cancellation: 'supported',
  },
  {
    provider: 'runway',
    model: 'gen4_image_turbo',
    modes: ['text-to-image', 'image-edit'],
    contractVersion: VERSION,
    sourceUrls: [
      'https://docs.dev.runwayml.com/api.md',
      'https://docs.dev.runwayml.com/guides/models/',
    ],
    maxReferences: 3,
    cancellation: 'supported',
  },
];
function reject(): never {
  throw new DirectMediaProviderError(
    'RUNWAY_CONTRACT_INVALID',
    'Runway request does not match the reviewed model contract.',
  );
}
function isSafeImageUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !!url.hostname &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export function compileRunwayDirectRequest(
  input: DirectMediaInput,
): PreparedDirectMediaRequest {
  const model = RUNWAY_DIRECT_MODELS.find(
    (value) => value.model === input.model,
  );
  if (
    !model?.modes.includes(input.mode) ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 1000 ||
    !Array.isArray(input.references) ||
    input.resolution !== undefined
  )
    reject();
  if (
    input.seed !== undefined &&
    (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295)
  )
    reject();
  const hasDimensions = input.width !== undefined || input.height !== undefined;
  if (
    hasDimensions &&
    (!Number.isInteger(input.width) || !Number.isInteger(input.height))
  )
    reject();
  const dimensions = hasDimensions
    ? `${input.width}:${input.height}`
    : undefined;
  if (dimensions && input.aspectRatio && dimensions !== input.aspectRatio)
    reject();
  const ratio = input.aspectRatio ?? dimensions;
  const isImage = input.model === 'gen4_image_turbo';
  const isFrame = input.mode === 'image-to-video';
  const ratios = isImage ? IMAGE_RATIOS : isFrame ? FRAME_RATIOS : VIDEO_RATIOS;
  if (!ratio || !ratios.includes(ratio)) reject();
  if (
    input.references.some(
      (reference) =>
        typeof reference.url !== 'string' ||
        !isSafeImageUri(reference.url) ||
        (reference.mimeType !== undefined &&
          !reference.mimeType.startsWith('image/')),
    )
  )
    reject();
  if (
    isImage
      ? input.references.length < 1 || input.references.length > 3
      : input.references.length !== (isFrame ? 1 : 0)
  )
    reject();
  if (
    isImage
      ? input.durationSeconds !== undefined
      : !Number.isInteger(input.durationSeconds) ||
        (input.durationSeconds ?? 0) < 2 ||
        (input.durationSeconds ?? 0) > 10
  )
    reject();
  const body: Record<string, unknown> = {
    model: input.model,
    promptText: input.prompt,
    ratio,
  };
  if (input.seed !== undefined) body.seed = input.seed;
  if (isImage)
    body.referenceImages = input.references.map((reference) => ({
      uri: reference.url,
    }));
  else {
    body.duration = input.durationSeconds;
    if (isFrame) body.promptImage = input.references[0].url;
  }
  return {
    provider: 'runway',
    model: input.model,
    mode: input.mode,
    contractVersion: VERSION,
    endpoint: isImage
      ? '/v1/text_to_image'
      : isFrame
        ? '/v1/image_to_video'
        : '/v1/text_to_video',
    body,
  };
}

import {
  type DirectMediaInput,
  type DirectMediaModelContract,
  DirectMediaProviderError,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';

export const BFL_DIRECT_CONTRACT_VERSION = 'bfl-flux-2-pro-2026-10-02';
const ENDPOINT = 'https://api.bfl.ai/v1/flux-2-pro';

export const BFL_DIRECT_MODELS: readonly DirectMediaModelContract[] =
  Object.freeze([
    Object.freeze({
      provider: 'bfl',
      model: 'flux-2-pro',
      modes: Object.freeze(['text-to-image', 'image-edit'] as const),
      contractVersion: BFL_DIRECT_CONTRACT_VERSION,
      sourceUrls: Object.freeze([
        'https://docs.bfl.ai/api-reference/models/generate-or-edit-an-image-with-flux2-[pro]',
        'https://docs.bfl.ai/quick_start/generating_images',
        'https://docs.bfl.ai/api-reference/utility/get-result',
      ]),
      maxReferences: 8,
      cancellation: 'unsupported',
    } satisfies DirectMediaModelContract),
  ]);

function invalidInput(): never {
  throw new DirectMediaProviderError(
    'DIRECT_MEDIA_INPUT_INVALID',
    'Input is unsupported by the reviewed BFL image contract.',
  );
}

export function compileBflDirectRequest(
  input: DirectMediaInput,
): PreparedDirectMediaRequest {
  if (
    input.model !== 'flux-2-pro' ||
    (input.mode !== 'text-to-image' && input.mode !== 'image-edit') ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    !Array.isArray(input.references) ||
    input.aspectRatio !== undefined ||
    input.durationSeconds !== undefined ||
    input.resolution !== undefined
  ) {
    invalidInput();
  }
  if (
    (input.mode === 'text-to-image' && input.references.length !== 0) ||
    (input.mode === 'image-edit' &&
      (input.references.length < 1 || input.references.length > 8))
  ) {
    invalidInput();
  }
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    output_format: 'jpeg',
  };
  for (const dimension of ['width', 'height'] as const) {
    const value = input[dimension];
    if (value !== undefined) {
      // FLUX.2 OpenAPI specifies integer >=64, no maximum or multiple-of constraint.
      if (!Number.isSafeInteger(value) || value < 64) invalidInput();
      body[dimension] = value;
    }
  }
  if (input.seed !== undefined) {
    // OpenAPI specifies integer with no minimum/maximum. Keep JS precision intact.
    if (!Number.isSafeInteger(input.seed)) invalidInput();
    body.seed = input.seed;
  }
  input.references.forEach((reference, index) => {
    if (
      !reference ||
      typeof reference.url !== 'string' ||
      (reference.mimeType !== undefined &&
        !reference.mimeType.startsWith('image/'))
    ) {
      invalidInput();
    }
    let url: URL;
    try {
      url = new URL(reference.url);
    } catch {
      invalidInput();
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      invalidInput();
    }
    body[index === 0 ? 'input_image' : `input_image_${index + 1}`] =
      reference.url;
  });
  return Object.freeze({
    provider: 'bfl',
    model: input.model,
    mode: input.mode,
    contractVersion: BFL_DIRECT_CONTRACT_VERSION,
    endpoint: ENDPOINT,
    body: Object.freeze(body),
  });
}

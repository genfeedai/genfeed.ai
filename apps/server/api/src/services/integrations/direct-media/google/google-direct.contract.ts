import {
  type DirectMediaInput,
  type DirectMediaModelContract,
  DirectMediaProviderError,
  type DirectMediaReference,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';

export const GOOGLE_DIRECT_ORIGIN = 'https://generativelanguage.googleapis.com';
const VERSION = 'google-direct-2026-10-02';
const NANO = 'gemini-3.1-flash-image';
const OMNI = 'gemini-omni-1.1-flash';
export const GOOGLE_DIRECT_VEO_MODEL = 'veo-3.1-generate-preview';
const MODELS: readonly DirectMediaModelContract[] = [
  {
    provider: 'google',
    model: NANO,
    modes: ['text-to-image', 'image-edit'],
    maxReferences: 14,
    cancellation: 'unsupported',
    contractVersion: VERSION,
    sourceUrls: [
      'https://ai.google.dev/gemini-api/docs/image-generation',
      'https://ai.google.dev/api/interactions',
    ],
  },
  {
    provider: 'google',
    model: OMNI,
    modes: ['text-to-video', 'image-to-video'],
    maxReferences: 1,
    cancellation: 'unsupported',
    contractVersion: VERSION,
    sourceUrls: [
      'https://ai.google.dev/gemini-api/docs/omni',
      'https://ai.google.dev/api/interactions',
    ],
  },
  {
    provider: 'google',
    model: GOOGLE_DIRECT_VEO_MODEL,
    modes: ['text-to-video', 'image-to-video'],
    maxReferences: 1,
    cancellation: 'unsupported',
    contractVersion: VERSION,
    sourceUrls: [
      'https://ai.google.dev/gemini-api/docs/veo',
      'https://ai.google.dev/api/models',
    ],
  },
];

export const GOOGLE_DIRECT_MODELS: readonly DirectMediaModelContract[] =
  Object.freeze(
    MODELS.map((contract) =>
      Object.freeze({
        ...contract,
        modes: Object.freeze([...contract.modes]),
        sourceUrls: Object.freeze([...contract.sourceUrls]),
      }),
    ),
  );

function invalid(): never {
  throw new DirectMediaProviderError(
    'GOOGLE_CONTRACT_UNSUPPORTED',
    'Google request does not match the reviewed media contract.',
  );
}

function checkedReference(
  reference: DirectMediaReference,
): Record<string, unknown> {
  if (
    !reference ||
    typeof reference.url !== 'string' ||
    Object.keys(reference).some((key) => !['url', 'mimeType'].includes(key))
  )
    invalid();
  const inline =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      reference.url,
    );
  if (inline) {
    if (
      inline[2].length % 4 !== 0 ||
      (reference.mimeType !== undefined && reference.mimeType !== inline[1])
    )
      invalid();
    return { type: 'image', data: inline[2], mime_type: inline[1] };
  }
  let url: URL;
  try {
    url = new URL(reference.url);
  } catch {
    return invalid();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (reference.mimeType !== undefined &&
      !['image/png', 'image/jpeg', 'image/webp'].includes(reference.mimeType))
  )
    invalid();
  return {
    type: 'image',
    uri: url.href,
    ...(reference.mimeType ? { mime_type: reference.mimeType } : {}),
  };
}

export function compileGoogleDirectRequest(
  input: DirectMediaInput,
): PreparedDirectMediaRequest {
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        ![
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
        ].includes(key),
    )
  )
    invalid();
  const contract = GOOGLE_DIRECT_MODELS.find(
    (entry) => entry.model === input.model,
  );
  if (
    !contract?.modes.includes(input.mode) ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    !Array.isArray(input.references)
  )
    invalid();
  if (
    input.width !== undefined ||
    input.height !== undefined ||
    input.seed !== undefined
  )
    invalid();
  const needsReference =
    input.mode === 'image-edit' || input.mode === 'image-to-video';
  if (
    input.references.length > contract.maxReferences ||
    (needsReference
      ? input.references.length === 0
      : input.references.length !== 0)
  )
    invalid();
  const refs = input.references.map(checkedReference);
  const isImage = input.model === NANO;
  const ratios = isImage
    ? [
        '1:1',
        '2:3',
        '3:2',
        '3:4',
        '4:3',
        '4:5',
        '5:4',
        '9:16',
        '16:9',
        '21:9',
        '1:8',
        '8:1',
        '1:4',
        '4:1',
      ]
    : ['16:9', '9:16'];
  if (input.aspectRatio !== undefined && !ratios.includes(input.aspectRatio))
    invalid();
  const resolutions = isImage
    ? ['512', '1K', '2K', '4K']
    : input.model === OMNI
      ? ['720p', '1080p']
      : ['720p', '1080p', '4k'];
  if (input.resolution !== undefined && !resolutions.includes(input.resolution))
    invalid();
  if (
    input.model !== GOOGLE_DIRECT_VEO_MODEL &&
    input.durationSeconds !== undefined
  )
    invalid();
  if (input.model === GOOGLE_DIRECT_VEO_MODEL) {
    if (
      input.durationSeconds !== undefined &&
      ![4, 6, 8].includes(input.durationSeconds)
    )
      invalid();
    if (
      input.resolution !== undefined &&
      input.resolution !== '720p' &&
      input.durationSeconds !== 8
    )
      invalid();
    // Veo REST requires inline image bytes; remote asset retrieval belongs to admission.
    if (refs.some((ref) => typeof ref.data !== 'string')) invalid();
    return {
      provider: 'google',
      model: input.model,
      mode: input.mode,
      contractVersion: VERSION,
      endpoint: `${GOOGLE_DIRECT_ORIGIN}/v1beta/models/${input.model}:predictLongRunning`,
      body: {
        instances: [
          {
            prompt: input.prompt,
            ...(refs.length
              ? {
                  image: {
                    bytesBase64Encoded: refs[0].data,
                    mimeType: refs[0].mime_type,
                  },
                }
              : {}),
          },
        ],
        parameters: {
          ...(input.aspectRatio !== undefined
            ? { aspectRatio: input.aspectRatio }
            : {}),
          ...(input.resolution !== undefined
            ? { resolution: input.resolution }
            : {}),
          ...(input.durationSeconds !== undefined
            ? { durationSeconds: input.durationSeconds }
            : {}),
        },
      },
    };
  }
  return {
    provider: 'google',
    model: input.model,
    mode: input.mode,
    contractVersion: VERSION,
    endpoint: `${GOOGLE_DIRECT_ORIGIN}/v1beta/interactions`,
    body: {
      model: input.model,
      input: refs.length
        ? [{ type: 'text', text: input.prompt }, ...refs]
        : input.prompt,
      response_format: {
        type: isImage ? 'image' : 'video',
        ...(!isImage ? { delivery: 'inline' } : {}),
        ...(input.aspectRatio !== undefined
          ? { aspect_ratio: input.aspectRatio }
          : {}),
        ...(input.resolution !== undefined
          ? { [isImage ? 'image_size' : 'resolution']: input.resolution }
          : {}),
      },
      ...(!isImage
        ? {
            generation_config: {
              video_config: {
                task: needsReference ? 'image_to_video' : 'text_to_video',
              },
            },
          }
        : {}),
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

/** Recompile the strict body before authenticating any externally supplied prepared request. */
export function validateGoogleDirectRequest(
  request: PreparedDirectMediaRequest,
): void {
  const body = record(request.body);
  let prompt: unknown;
  let references: DirectMediaReference[] = [];
  let ratio: unknown;
  let resolution: unknown;
  let duration: unknown;
  if (request.model === GOOGLE_DIRECT_VEO_MODEL) {
    if (!Array.isArray(body.instances) || body.instances.length !== 1)
      invalid();
    const instance = record(body.instances[0]);
    prompt = instance.prompt;
    if (instance.image !== undefined) {
      const image = record(instance.image);
      if (
        Object.keys(image).some(
          (key) => !['bytesBase64Encoded', 'mimeType'].includes(key),
        )
      )
        invalid();
      references = [
        { url: `data:${image.mimeType};base64,${image.bytesBase64Encoded}` },
      ];
    }
    const parameters = record(body.parameters);
    ratio = parameters.aspectRatio;
    resolution = parameters.resolution;
    duration = parameters.durationSeconds;
  } else {
    if (typeof body.input === 'string') prompt = body.input;
    else {
      if (!Array.isArray(body.input) || body.input.length < 2) invalid();
      const text = record(body.input[0]);
      if (
        text.type !== 'text' ||
        Object.keys(text).some((key) => !['type', 'text'].includes(key))
      )
        invalid();
      prompt = text.text;
      references = body.input.slice(1).map((value) => {
        const image = record(value);
        if (
          image.type !== 'image' ||
          Object.keys(image).some(
            (key) => !['type', 'data', 'mime_type', 'uri'].includes(key),
          ) ||
          (image.data !== undefined && image.uri !== undefined)
        )
          invalid();
        return {
          url:
            image.uri !== undefined
              ? String(image.uri)
              : `data:${image.mime_type};base64,${image.data}`,
          ...(image.mime_type !== undefined
            ? { mimeType: String(image.mime_type) }
            : {}),
        };
      });
    }
    const format = record(body.response_format);
    ratio = format.aspect_ratio;
    resolution = request.model === NANO ? format.image_size : format.resolution;
  }
  if (
    typeof prompt !== 'string' ||
    (ratio !== undefined && typeof ratio !== 'string') ||
    (resolution !== undefined && typeof resolution !== 'string') ||
    (duration !== undefined && typeof duration !== 'number')
  )
    invalid();
  const compiled = compileGoogleDirectRequest({
    model: request.model,
    mode: request.mode,
    prompt,
    references,
    ...(ratio !== undefined ? { aspectRatio: ratio } : {}),
    ...(resolution !== undefined ? { resolution } : {}),
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
  });
  if (canonical(request) !== canonical(compiled)) invalid();
}

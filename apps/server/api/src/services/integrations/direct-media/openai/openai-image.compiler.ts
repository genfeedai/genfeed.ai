import {
  type DirectMediaInput,
  type DirectMediaModelContract,
  DirectMediaProviderError,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';

export const OPENAI_IMAGE_CONTRACT: Readonly<DirectMediaModelContract> =
  Object.freeze({
    provider: 'openai',
    model: 'gpt-image-2',
    modes: Object.freeze(['text-to-image', 'image-edit'] as const),
    contractVersion: 'openai-gpt-image-2-2026-10-02',
    sourceUrls: Object.freeze([
      'https://developers.openai.com/api/docs/models/gpt-image-2',
      'https://developers.openai.com/api/reference/resources/images/methods/generate',
      'https://developers.openai.com/api/reference/resources/images/methods/edit',
      'https://developers.openai.com/api/docs/guides/image-generation',
    ]),
    maxReferences: 16,
    cancellation: 'unsupported',
  });
const MODEL = 'gpt-image-2';
const CONTRACT_VERSION = 'openai-gpt-image-2-2026-10-02';
const INPUT_FIELDS = [
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
];

function invalid(): never {
  throw new DirectMediaProviderError(
    'invalid_request',
    'Unsupported OpenAI image request.',
  );
}

/** Read data descriptors only: unknown fields and accessors cannot become controls. */
function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function referenceUrls(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 16
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const urls: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
    const reference = record(descriptor.value, ['url', 'mimeType']);
    const url = reference.url;
    if (
      typeof url !== 'string' ||
      !url.startsWith('https://') ||
      /\s/.test(url)
    )
      invalid();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      invalid();
    }
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      url.includes('#')
    )
      invalid();
    if (
      reference.mimeType !== undefined &&
      (typeof reference.mimeType !== 'string' ||
        !/^image\/[a-z0-9.+-]+$/i.test(reference.mimeType))
    )
      invalid();
    urls.push(url);
  }
  return urls;
}

function size(input: Record<string, unknown>): string {
  const { width, height, aspectRatio } = input;
  if (width === undefined && height === undefined) {
    if (aspectRatio !== undefined) invalid();
    return 'auto';
  }
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 3840 ||
    height > 3840 ||
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    Math.max(width, height) > Math.min(width, height) * 3 ||
    width * height < 655360 ||
    width * height > 8294400
  )
    invalid();
  if (aspectRatio !== undefined) {
    if (
      typeof aspectRatio !== 'string' ||
      !/^[1-9]\d*:[1-9]\d*$/.test(aspectRatio)
    )
      invalid();
    const [horizontal, vertical] = aspectRatio.split(':').map(Number);
    if (
      !Number.isSafeInteger(horizontal) ||
      !Number.isSafeInteger(vertical) ||
      BigInt(width) * BigInt(vertical) !== BigInt(height) * BigInt(horizontal)
    )
      invalid();
  }
  return `${width}x${height}`;
}

/** References must already have passed tenant asset admission; this performs no URL fetch. */
export function compileOpenAIImageRequest(
  input: DirectMediaInput,
): PreparedDirectMediaRequest {
  const value = record(input, INPUT_FIELDS);
  if (
    value.model !== MODEL ||
    (value.mode !== 'text-to-image' && value.mode !== 'image-edit') ||
    typeof value.prompt !== 'string' ||
    !value.prompt.trim() ||
    value.prompt.length > 32000 ||
    value.durationSeconds !== undefined ||
    value.resolution !== undefined ||
    value.seed !== undefined
  )
    invalid();
  const urls = referenceUrls(value.references);
  if (
    (value.mode === 'text-to-image' && urls.length !== 0) ||
    (value.mode === 'image-edit' && urls.length === 0)
  )
    invalid();
  return {
    provider: 'openai',
    model: MODEL,
    mode: value.mode,
    contractVersion: CONTRACT_VERSION,
    endpoint:
      value.mode === 'image-edit'
        ? 'https://api.openai.com/v1/images/edits'
        : 'https://api.openai.com/v1/images/generations',
    body: {
      model: MODEL,
      prompt: value.prompt,
      size: size(value),
      n: 1,
      quality: 'auto',
      output_format: 'png',
      background: 'opaque',
      moderation: 'auto',
      stream: false,
      ...(value.mode === 'image-edit'
        ? { images: urls.map((url) => ({ image_url: url })) }
        : {}),
    },
  };
}

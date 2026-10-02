import {
  type DirectMediaCancellation,
  type DirectMediaClient,
  type DirectMediaCredentialValidation,
  type DirectMediaPollResult,
  DirectMediaProviderError,
  type DirectMediaRequestContext,
  type DirectMediaSubmission,
  type DirectMediaTask,
  type DirectMediaTransport,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';
import { requestDirectMediaJson } from '@api/services/integrations/direct-media/direct-media-transport';
import { compileOpenAIImageRequest } from '@api/services/integrations/direct-media/openai/openai-image.compiler';

function invalidRequest(): never {
  throw new DirectMediaProviderError(
    'PROVIDER_REQUEST_INVALID',
    'Unsupported OpenAI image request.',
  );
}
function credential(apiKey: unknown): string {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
    throw new DirectMediaProviderError(
      'PROVIDER_CREDENTIAL_INVALID',
      'Provider credential is invalid.',
    );
  }
  return apiKey;
}
function invalidResponse(): never {
  throw new DirectMediaProviderError(
    'PROVIDER_RESPONSE_INVALID',
    'Provider returned an invalid image response.',
    true,
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidRequest();
  return value as Record<string, unknown>;
}
/** Traverse only the frozen request shape; never descend into unknown controls. */
function canonical(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || !value) invalidRequest();
  if (Array.isArray(value)) {
    if (
      depth !== 2 ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > 16
    )
      invalidRequest();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1)
      invalidRequest();
    return Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
        invalidRequest();
      return canonical(descriptor.value, depth + 1);
    });
  }
  const fields =
    depth === 0
      ? ['provider', 'model', 'mode', 'contractVersion', 'endpoint', 'body']
      : depth === 1
        ? [
            'model',
            'prompt',
            'size',
            'n',
            'quality',
            'output_format',
            'background',
            'moderation',
            'stream',
            'images',
          ]
        : depth === 3
          ? ['image_url']
          : undefined;
  if (
    !fields ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalidRequest();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !fields.includes(key)))
    invalidRequest();
  return Object.fromEntries(
    (keys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
        invalidRequest();
      return [key, canonical(descriptor.value, depth + 1)];
    }),
  );
}
function revalidate(
  request: PreparedDirectMediaRequest,
): PreparedDirectMediaRequest {
  const prepared = record(canonical(request));
  const body = record(prepared.body);
  if (
    (prepared.mode !== 'text-to-image' && prepared.mode !== 'image-edit') ||
    typeof body.model !== 'string' ||
    typeof body.prompt !== 'string' ||
    typeof body.size !== 'string'
  )
    invalidRequest();
  const dimensions =
    body.size === 'auto' ? undefined : /^(\d+)x(\d+)$/.exec(body.size);
  if (body.size !== 'auto' && !dimensions) invalidRequest();
  if (prepared.mode === 'image-edit' && !Array.isArray(body.images))
    invalidRequest();
  const references =
    prepared.mode === 'image-edit'
      ? (body.images as unknown[]).map((image) => {
          const entry = record(image);
          if (
            Object.keys(entry).length !== 1 ||
            typeof entry.image_url !== 'string'
          )
            invalidRequest();
          return { url: entry.image_url };
        })
      : [];
  const compiled = compileOpenAIImageRequest({
    model: body.model,
    mode: prepared.mode,
    prompt: body.prompt,
    references,
    ...(dimensions
      ? { width: Number(dimensions[1]), height: Number(dimensions[2]) }
      : {}),
  });
  if (JSON.stringify(prepared) !== JSON.stringify(canonical(compiled)))
    invalidRequest();
  return compiled;
}
/** PNG framing validation; pixel processing and tenant-safe asset persistence belong to admission/persistence. */
function png(base64: unknown): string {
  if (
    typeof base64 !== 'string' ||
    !base64 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  )
    invalidResponse();
  const bytes = Buffer.from(base64, 'base64');
  if (
    bytes.toString('base64') !== base64 ||
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    invalidResponse();
  let offset = 8;
  let hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (length > bytes.length - offset - 12) invalidResponse();
    if (
      offset === 8 &&
      (kind !== 'IHDR' ||
        length !== 13 ||
        bytes.readUInt32BE(offset + 8) === 0 ||
        bytes.readUInt32BE(offset + 12) === 0)
    )
      invalidResponse();
    if (offset !== 8 && kind === 'IHDR') invalidResponse();
    if (kind === 'IDAT' && length > 0) hasData = true;
    offset += length + 12;
    if (kind === 'IEND') {
      if (length !== 0 || offset !== bytes.length || !hasData)
        invalidResponse();
      return base64;
    }
  }
  invalidResponse();
}

export class OpenAIImageClient implements DirectMediaClient {
  constructor(private readonly transport: DirectMediaTransport = fetch) {}

  /** Models-list authentication is not proof of GPT Image entitlement. */
  async validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation> {
    try {
      const apiKey = credential(context.apiKey);
      const result = await requestDirectMediaJson(
        this.transport,
        'https://api.openai.com/v1/models',
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: context.signal,
        },
      );
      if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        !Array.isArray((result as Record<string, unknown>).data)
      ) {
        return { isValid: false, error: 'PROVIDER_RESPONSE_INVALID' };
      }
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof DirectMediaProviderError
            ? error.code
            : 'PROVIDER_CONNECTION_FAILED',
      };
    }
  }

  async submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission> {
    const prepared = revalidate(request);
    const apiKey = credential(context.apiKey);
    if (context.signal?.aborted)
      throw new DirectMediaProviderError(
        'PROVIDER_CONNECTION_FAILED',
        'Provider request was aborted before submission.',
      );
    const init: RequestInit = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prepared.body),
      signal: context.signal,
    };
    try {
      context.onProviderSubmissionStarted?.();
    } catch {
      throw new DirectMediaProviderError(
        'PROVIDER_PREPARATION_FAILED',
        'Provider submission preparation failed.',
      );
    }
    const result = await requestDirectMediaJson(
      this.transport,
      prepared.endpoint,
      init,
      180_000,
    );
    if (!result || typeof result !== 'object' || Array.isArray(result))
      invalidResponse();
    const response = result as Record<string, unknown>;
    if (
      !Array.isArray(response.data) ||
      response.data.length !== 1 ||
      (response.output_format !== undefined && response.output_format !== 'png')
    )
      invalidResponse();
    const image: unknown = response.data[0];
    if (!image || typeof image !== 'object' || Array.isArray(image))
      invalidResponse();
    const output = image as Record<string, unknown>;
    if (
      Object.hasOwn(output, 'url') ||
      (output.mime_type !== undefined && output.mime_type !== 'image/png') ||
      (output.mimeType !== undefined && output.mimeType !== 'image/png')
    )
      invalidResponse();
    return {
      kind: 'inline',
      outputs: [{ base64: png(output.b64_json), mimeType: 'image/png' }],
    };
  }

  async poll(
    _task: DirectMediaTask,
    _context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult> {
    throw new DirectMediaProviderError(
      'PROVIDER_TASK_UNSUPPORTED',
      'OpenAI image tasks do not support polling.',
    );
  }
  async cancel(
    _task: DirectMediaTask,
    _context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation> {
    return { status: 'unsupported' };
  }
}

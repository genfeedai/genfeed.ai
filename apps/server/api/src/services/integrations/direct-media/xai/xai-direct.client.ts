import {
  type DirectMediaCancellation,
  type DirectMediaClient,
  type DirectMediaCredentialValidation,
  type DirectMediaInput,
  type DirectMediaOutput,
  type DirectMediaPollResult,
  DirectMediaProviderError,
  type DirectMediaRequestContext,
  type DirectMediaSubmission,
  type DirectMediaTask,
  type DirectMediaTransport,
  type PreparedDirectMediaRequest,
} from '@api/services/integrations/direct-media/direct-media.types';
import { requestDirectMediaJson } from '@api/services/integrations/direct-media/direct-media-transport';
import {
  compileXaiDirectRequest,
  XAI_DIRECT_MODELS,
} from '@api/services/integrations/direct-media/xai/xai-direct.contract';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function rejectInput(): never {
  throw new DirectMediaProviderError(
    'PROVIDER_INPUT_INVALID',
    'Unsupported direct xAI media request.',
  );
}
function invalidResponse(isSubmission = false): never {
  throw new DirectMediaProviderError(
    'PROVIDER_RESPONSE_INVALID',
    'Provider returned an unusable response.',
    isSubmission,
  );
}
function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
function validateContext(context: DirectMediaRequestContext): void {
  if (
    typeof context.apiKey !== 'string' ||
    !context.apiKey.trim() ||
    /\s/.test(context.apiKey)
  ) {
    throw new DirectMediaProviderError(
      'PROVIDER_CREDENTIAL_REQUIRED',
      'A direct provider credential is required.',
    );
  }
  if (context.signal?.aborted) {
    throw new DirectMediaProviderError(
      'PROVIDER_REQUEST_ABORTED',
      'Provider request was aborted before submission.',
    );
  }
}
function validateTask(task: DirectMediaTask): void {
  if (
    !isSafeId(task.externalId) ||
    task.pollingUrl !== undefined ||
    (task.model !== undefined && task.model !== 'grok-imagine-video-1.5')
  )
    rejectInput();
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  const a = record(left);
  const b = record(right);
  if (!a || !b) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
  );
}
/** Recompile the prepared body; forged endpoints, extra controls and mode drift fail before POST. */
function validatePrepared(
  request: PreparedDirectMediaRequest,
): PreparedDirectMediaRequest {
  const body = record(request.body);
  if (!body || body.model !== request.model || typeof body.prompt !== 'string')
    rejectInput();
  if (body.image !== undefined && body.images !== undefined) rejectInput();
  const sources =
    body.images !== undefined
      ? body.images
      : body.image !== undefined
        ? [body.image]
        : [];
  if (!Array.isArray(sources)) rejectInput();
  const references = sources.map((source: unknown) => {
    const item = record(source);
    if (
      !item ||
      typeof item.url !== 'string' ||
      item.type !== 'image_url' ||
      Object.keys(item).length !== 2
    )
      rejectInput();
    return { url: item.url };
  });
  if (
    (body.aspect_ratio !== undefined &&
      typeof body.aspect_ratio !== 'string') ||
    (body.resolution !== undefined && typeof body.resolution !== 'string') ||
    (body.duration !== undefined && typeof body.duration !== 'number')
  )
    rejectInput();
  const input: DirectMediaInput = {
    model: request.model,
    mode: request.mode,
    prompt: body.prompt,
    references,
    aspectRatio: body.aspect_ratio as string | undefined,
    resolution: body.resolution as string | undefined,
    durationSeconds: body.duration as number | undefined,
  };
  const prepared = compileXaiDirectRequest(input);
  if (
    request.provider !== prepared.provider ||
    request.contractVersion !== prepared.contractVersion ||
    request.endpoint !== prepared.endpoint ||
    !sameValue(body, prepared.body)
  )
    rejectInput();
  return prepared;
}

export class XaiDirectClient implements DirectMediaClient {
  constructor(private readonly transport: DirectMediaTransport = fetch) {}

  async validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation> {
    try {
      validateContext(context);
      const response = record(
        await this.get('https://api.x.ai/v1/api-key', context),
      );
      if (
        !response ||
        typeof response.api_key_blocked !== 'boolean' ||
        typeof response.api_key_disabled !== 'boolean' ||
        typeof response.team_blocked !== 'boolean' ||
        !Array.isArray(response.acls) ||
        !response.acls.every((acl: unknown) => typeof acl === 'string')
      ) {
        return {
          isValid: false,
          error: 'Provider credential validation is unavailable.',
        };
      }
      if (
        response.api_key_blocked ||
        response.api_key_disabled ||
        response.team_blocked
      )
        return {
          isValid: false,
          error: 'Provider credential is blocked or disabled.',
        };
      const acls: string[] = response.acls;
      const hasModelAccess =
        acls.includes('api-key:model:*') ||
        XAI_DIRECT_MODELS.some((model) =>
          acls.includes(`api-key:model:${model.model}`),
        );
      if (!hasModelAccess || !acls.includes('api-key:endpoint:*'))
        return {
          isValid: false,
          error: 'Provider credential media access could not be verified.',
        };
      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: 'Provider credential could not be validated.',
      };
    }
  }

  async submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission> {
    validateContext(context);
    const prepared = validatePrepared(request);
    const body = JSON.stringify(prepared.body);
    context.onProviderSubmissionStarted?.();
    const response = record(
      await requestDirectMediaJson(this.transport, prepared.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: context.signal,
      }),
    );
    if (!response) invalidResponse(true);
    if (prepared.model === 'grok-imagine-video-1.5') {
      if (
        !isSafeId(response.request_id) ||
        response.request_id.includes(context.apiKey)
      )
        invalidResponse(true);
      return {
        kind: 'task',
        externalId: response.request_id,
        model: prepared.model,
      };
    }
    if (!Array.isArray(response.data) || response.data.length === 0)
      invalidResponse(true);
    const outputs: DirectMediaOutput[] = response.data.map((value: unknown) => {
      const item = record(value);
      if (!item) invalidResponse(true);
      if (isHttpsUrl(item.url) && !item.url.includes(context.apiKey))
        return { url: item.url, mimeType: 'image/jpeg' };
      if (
        typeof item.b64_json === 'string' &&
        item.b64_json.length > 0 &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          item.b64_json,
        ) &&
        !item.b64_json.includes(context.apiKey)
      )
        return { base64: item.b64_json, mimeType: 'image/jpeg' };
      return invalidResponse(true);
    });
    return { kind: 'inline', outputs };
  }

  async poll(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult> {
    validateContext(context);
    validateTask(task);
    const response = record(
      await this.get(`https://api.x.ai/v1/videos/${task.externalId}`, context),
    );
    if (!response) invalidResponse();
    switch (response.status) {
      case 'pending':
        return { status: 'running' };
      case 'done': {
        const video = record(response.video);
        if (
          video?.respect_moderation !== true ||
          !isHttpsUrl(video.url) ||
          video.url.includes(context.apiKey)
        )
          invalidResponse();
        return {
          status: 'succeeded',
          outputs: [{ url: video.url, mimeType: 'video/mp4' }],
        };
      }
      case 'failed':
      case 'expired':
        return {
          status: 'failed',
          error: {
            code:
              response.status === 'expired'
                ? 'PROVIDER_TASK_EXPIRED'
                : 'PROVIDER_TASK_FAILED',
            message: 'Provider video generation failed.',
          },
        };
      default:
        return invalidResponse();
    }
  }

  async cancel(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation> {
    validateContext(context);
    validateTask(task);
    return { status: 'unsupported' };
  }

  private get(
    url: string,
    context: DirectMediaRequestContext,
  ): Promise<unknown> {
    return requestDirectMediaJson(this.transport, url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${context.apiKey}` },
      signal: context.signal,
    });
  }
}

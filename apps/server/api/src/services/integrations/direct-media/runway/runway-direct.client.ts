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
import {
  requestDirectMediaEmpty,
  requestDirectMediaJson,
} from '@api/services/integrations/direct-media/direct-media-transport';
import { compileRunwayDirectRequest } from '@api/services/integrations/direct-media/runway/runway-direct.contract';

const ORIGIN = 'https://api.dev.runwayml.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(isSubmissionUncertain = false): never {
  throw new DirectMediaProviderError(
    'PROVIDER_RESPONSE_INVALID',
    'Runway returned an invalid response.',
    isSubmissionUncertain,
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function taskUrl(task: DirectMediaTask): string {
  if (
    typeof task.externalId !== 'string' ||
    !UUID.test(task.externalId) ||
    (task.model !== undefined &&
      !['gen4.5', 'gen4_image_turbo'].includes(task.model))
  )
    throw new DirectMediaProviderError(
      'RUNWAY_TASK_INVALID',
      'Invalid Runway task identity.',
    );
  const url = `${ORIGIN}/v1/tasks/${task.externalId}`;
  if (task.pollingUrl !== undefined && task.pollingUrl !== url)
    throw new DirectMediaProviderError(
      'RUNWAY_TASK_INVALID',
      'Invalid Runway task identity.',
    );
  return url;
}
function headers(context: DirectMediaRequestContext): Record<string, string> {
  if (!context.apiKey || /[\r\n]/.test(context.apiKey))
    throw new DirectMediaProviderError(
      'PROVIDER_ACCESS_DENIED',
      'A valid Runway credential is required.',
    );
  return {
    Authorization: `Bearer ${context.apiKey}`,
    'X-Runway-Version': '2024-11-06',
    'Content-Type': 'application/json',
  };
}
function validatePrepared(request: PreparedDirectMediaRequest): void {
  const body = record(request.body);
  const references =
    body.referenceImages === undefined
      ? body.promptImage === undefined
        ? []
        : [{ url: body.promptImage as string }]
      : Array.isArray(body.referenceImages)
        ? body.referenceImages.map((value) => ({
            url: record(value).uri as string,
          }))
        : invalid();
  const compiled = compileRunwayDirectRequest({
    model: request.model,
    mode: request.mode,
    prompt: body.promptText as string,
    references,
    aspectRatio: body.ratio as string,
    durationSeconds: body.duration as number | undefined,
    seed: body.seed as number | undefined,
  });
  if (
    request.provider !== 'runway' ||
    request.contractVersion !== compiled.contractVersion ||
    request.endpoint !== compiled.endpoint ||
    body.model !== request.model ||
    Object.keys(body).length !== Object.keys(compiled.body).length ||
    Object.entries(compiled.body).some(
      ([key, value]) => JSON.stringify(body[key]) !== JSON.stringify(value),
    )
  )
    throw new DirectMediaProviderError(
      'RUNWAY_CONTRACT_INVALID',
      'Runway request does not match the reviewed model contract.',
    );
}
export class RunwayDirectClient implements DirectMediaClient {
  constructor(private readonly transport: DirectMediaTransport = fetch) {}
  async validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation> {
    try {
      const response = record(
        await requestDirectMediaJson(
          this.transport,
          `${ORIGIN}/v1/organization`,
          { method: 'GET', headers: headers(context), signal: context.signal },
        ),
      );
      if (
        !Number.isInteger(response.creditBalance) ||
        (response.creditBalance as number) < 0
      )
        invalid();
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof DirectMediaProviderError
            ? error.code
            : 'PROVIDER_VALIDATION_FAILED',
      };
    }
  }
  async submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission> {
    validatePrepared(request);
    const requestHeaders = headers(context);
    const body = JSON.stringify(request.body);
    if (context.signal?.aborted)
      throw new DirectMediaProviderError(
        'PROVIDER_REQUEST_ABORTED',
        'Provider submission was aborted before it started.',
      );
    context.onProviderSubmissionStarted?.();
    const response = await requestDirectMediaJson(
      this.transport,
      `${ORIGIN}${request.endpoint}`,
      { method: 'POST', headers: requestHeaders, body, signal: context.signal },
    );
    if (!response || typeof response !== 'object' || Array.isArray(response))
      invalid(true);
    const id = (response as Record<string, unknown>).id;
    if (typeof id !== 'string' || !UUID.test(id)) invalid(true);
    return { kind: 'task', externalId: id, model: request.model };
  }
  async poll(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult> {
    const url = taskUrl(task);
    const response = record(
      await requestDirectMediaJson(this.transport, url, {
        method: 'GET',
        headers: headers(context),
        signal: context.signal,
      }),
    );
    switch (response.status) {
      case 'PENDING':
      case 'THROTTLED':
        return { status: 'queued' };
      case 'RUNNING':
        return { status: 'running' };
      case 'CANCELLED':
        return { status: 'cancelled' };
      case 'FAILED':
        return {
          status: 'failed',
          error: {
            code: 'RUNWAY_TASK_FAILED',
            message: 'Runway generation failed.',
          },
        };
      case 'SUCCEEDED': {
        if (!Array.isArray(response.output) || response.output.length === 0)
          invalid();
        const outputs = response.output.map((value) => {
          if (typeof value !== 'string') invalid();
          let url: URL;
          try {
            url = new URL(value);
          } catch {
            invalid();
          }
          if (url.protocol !== 'https:' || url.username || url.password)
            invalid();
          return { url: value };
        });
        return { status: 'succeeded', outputs };
      }
      default:
        invalid();
    }
  }
  async cancel(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation> {
    const url = taskUrl(task);
    const state = record(
      await requestDirectMediaJson(this.transport, url, {
        method: 'GET',
        headers: headers(context),
        signal: context.signal,
      }),
    );
    if (state.status === 'CANCELLED') return { status: 'confirmed' };
    if (state.status === 'FAILED' || state.status === 'SUCCEEDED')
      return { status: 'unsupported' };
    if (!['PENDING', 'THROTTLED', 'RUNNING'].includes(state.status as string))
      invalid();
    await requestDirectMediaEmpty(this.transport, url, {
      method: 'DELETE',
      headers: headers(context),
      signal: context.signal,
    });
    return { status: 'requested' };
  }
}

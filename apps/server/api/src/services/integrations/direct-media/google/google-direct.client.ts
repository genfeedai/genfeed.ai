import {
  type DirectMediaCancellation,
  type DirectMediaClient,
  type DirectMediaCredentialValidation,
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
  GOOGLE_DIRECT_ORIGIN,
  GOOGLE_DIRECT_VEO_MODEL,
  validateGoogleDirectRequest,
} from '@api/services/integrations/direct-media/google/google-direct.contract';

function responseInvalid(isSubmissionUncertain = false): never {
  throw new DirectMediaProviderError(
    'GOOGLE_RESPONSE_INVALID',
    'Google returned an unsupported media response.',
    isSubmissionUncertain,
  );
}
function record(
  value: unknown,
  isSubmissionUncertain = false,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    responseInvalid(isSubmissionUncertain);
  return value as Record<string, unknown>;
}
function requireKey(context: DirectMediaRequestContext): void {
  if (
    typeof context.apiKey !== 'string' ||
    !context.apiKey.trim() ||
    /[\r\n]/.test(context.apiKey)
  ) {
    throw new DirectMediaProviderError(
      'GOOGLE_CREDENTIAL_REQUIRED',
      'An explicit Google API credential is required.',
    );
  }
}
function operationUrl(task: DirectMediaTask): string {
  if (
    !/^models\/veo-3\.1-generate-preview\/operations\/[A-Za-z0-9_-]+$/.test(
      task.externalId,
    ) ||
    (task.model !== undefined && task.model !== GOOGLE_DIRECT_VEO_MODEL)
  ) {
    throw new DirectMediaProviderError(
      'GOOGLE_RECOVERY_UNSUPPORTED',
      'Only reviewed Veo operations support recovery.',
    );
  }
  const url = `${GOOGLE_DIRECT_ORIGIN}/v1beta/${task.externalId}`;
  if (task.pollingUrl !== undefined && task.pollingUrl !== url) {
    throw new DirectMediaProviderError(
      'GOOGLE_TASK_INVALID',
      'Google polling URL does not match the recorded operation.',
    );
  }
  return url;
}

/** Output access is handed to the account-bound downloader; no embedded credentials survive. */
function protectedOutput(
  uri: unknown,
  context: DirectMediaRequestContext,
  mimeType: string,
  isSubmissionUncertain = false,
): DirectMediaOutput {
  if (typeof uri !== 'string' || uri.includes(context.apiKey))
    responseInvalid(isSubmissionUncertain);
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return responseInvalid(isSubmissionUncertain);
  }
  if (
    url.origin !== GOOGLE_DIRECT_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/v1beta\/files\/[A-Za-z0-9_-]+(?::download)?$/.test(url.pathname) ||
    [...url.searchParams].some(
      ([key, value]) => key !== 'alt' || value !== 'media',
    )
  )
    responseInvalid(isSubmissionUncertain);
  return { url: url.href, mimeType, requiresCredential: true };
}

export class GoogleDirectClient implements DirectMediaClient {
  constructor(private readonly transport: DirectMediaTransport = fetch) {}

  async validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation> {
    try {
      requireKey(context);
      const response = record(
        await this.request(
          `${GOOGLE_DIRECT_ORIGIN}/v1beta/models/gemini-3.1-flash-image`,
          'GET',
          context,
        ),
      );
      if (response.name !== 'models/gemini-3.1-flash-image') responseInvalid();
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof DirectMediaProviderError
            ? error.code
            : 'GOOGLE_CREDENTIAL_VALIDATION_FAILED',
      };
    }
  }

  async submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission> {
    validateGoogleDirectRequest(request);
    requireKey(context);
    if (context.signal?.aborted) {
      throw new DirectMediaProviderError(
        'GOOGLE_REQUEST_ABORTED',
        'Google submission was aborted before dispatch.',
      );
    }
    const body = JSON.stringify(request.body);
    const { endpoint, model } = request;
    context.onProviderSubmissionStarted?.();
    const response = record(
      await this.request(endpoint, 'POST', context, body),
      true,
    );
    if (model === GOOGLE_DIRECT_VEO_MODEL) {
      if (
        typeof response.name !== 'string' ||
        response.name.includes(context.apiKey)
      )
        responseInvalid(true);
      const task = { externalId: response.name, model };
      let pollingUrl: string;
      try {
        pollingUrl = operationUrl(task);
      } catch {
        return responseInvalid(true);
      }
      return { kind: 'task', ...task, pollingUrl };
    }
    // Background media execution is deliberately unsupported: never invent a pollable task.
    if (
      (response.status !== undefined && response.status !== 'completed') ||
      !Array.isArray(response.steps)
    )
      responseInvalid(true);
    const expectedType = model === 'gemini-3.1-flash-image' ? 'image' : 'video';
    const outputs: DirectMediaOutput[] = [];
    for (const stepValue of response.steps) {
      const step = record(stepValue, true);
      if (step.type !== 'model_output') continue;
      if (!Array.isArray(step.content)) responseInvalid(true);
      for (const contentValue of step.content) {
        const content = record(contentValue, true);
        if (content.type !== expectedType) continue;
        const mimeType =
          content.mime_type ??
          (expectedType === 'video' ? 'video/mp4' : undefined);
        if (
          typeof mimeType !== 'string' ||
          !(
            expectedType === 'image'
              ? ['image/png', 'image/jpeg', 'image/webp']
              : ['video/mp4']
          ).includes(mimeType)
        )
          responseInvalid(true);
        if (
          typeof content.data === 'string' &&
          content.uri === undefined &&
          /^[A-Za-z0-9+/]+={0,2}$/.test(content.data) &&
          content.data.length % 4 === 0 &&
          !content.data.includes(context.apiKey)
        ) {
          outputs.push({ base64: content.data, mimeType });
        } else if (
          content.data === undefined &&
          typeof content.uri === 'string'
        ) {
          // URI delivery additionally requires file readiness checks in the account-bound output layer.
          outputs.push(protectedOutput(content.uri, context, mimeType, true));
        } else responseInvalid(true);
      }
    }
    if (!outputs.length) responseInvalid(true);
    return { kind: 'inline', outputs };
  }

  async poll(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult> {
    const url = operationUrl(task);
    requireKey(context);
    const response = record(await this.request(url, 'GET', context));
    if (response.name !== undefined && response.name !== task.externalId)
      responseInvalid();
    if (response.done !== undefined && typeof response.done !== 'boolean')
      responseInvalid();
    if (response.done !== true) return { status: 'running' };
    if (response.error !== undefined)
      return {
        status: 'failed',
        error: {
          code: 'GOOGLE_OPERATION_FAILED',
          message: 'Google video generation failed.',
        },
      };
    const result = record(record(response.response).generateVideoResponse);
    if (
      !Array.isArray(result.generatedSamples) ||
      !result.generatedSamples.length
    ) {
      if (
        typeof result.raiMediaFilteredCount === 'number' &&
        result.raiMediaFilteredCount > 0
      )
        return {
          status: 'failed',
          error: {
            code: 'GOOGLE_MEDIA_FILTERED',
            message: 'Google did not return generated media.',
          },
        };
      responseInvalid();
    }
    const outputs = result.generatedSamples.map((sample) =>
      protectedOutput(record(record(sample).video).uri, context, 'video/mp4'),
    );
    return { status: 'succeeded', outputs };
  }

  async cancel(
    _task: DirectMediaTask,
    _context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation> {
    // Aborting local HTTP work never confirms remote cancellation or a billing refund.
    return { status: 'unsupported' };
  }

  private request(
    url: string,
    method: 'GET' | 'POST',
    context: DirectMediaRequestContext,
    body?: string,
  ): Promise<unknown> {
    return requestDirectMediaJson(this.transport, url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': context.apiKey,
      },
      signal: context.signal,
      ...(body !== undefined ? { body } : {}),
    });
  }
}

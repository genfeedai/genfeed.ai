import {
  BFL_DIRECT_CONTRACT_VERSION,
  compileBflDirectRequest,
} from '@api/services/integrations/direct-media/bfl/bfl-direct.contract';
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

const POLLING_ORIGINS = new Set([
  'https://api.bfl.ai',
  'https://api.eu.bfl.ai',
  'https://api.us.bfl.ai',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(isSubmissionUncertain = false): never {
  throw new DirectMediaProviderError(
    'PROVIDER_RESPONSE_INVALID',
    'BFL returned an unsupported response.',
    isSubmissionUncertain,
  );
}

function requireCredential(context: DirectMediaRequestContext): void {
  if (typeof context.apiKey !== 'string' || !context.apiKey.trim()) {
    throw new DirectMediaProviderError(
      'PROVIDER_CREDENTIAL_MISSING',
      'A BFL account credential is required.',
    );
  }
}

function validatePollingUrl(task: DirectMediaTask): string {
  if (
    typeof task.externalId !== 'string' ||
    !task.externalId.trim() ||
    typeof task.pollingUrl !== 'string'
  ) {
    throw new DirectMediaProviderError(
      'PROVIDER_POLL_URL_INVALID',
      'BFL polling URL is unsupported.',
    );
  }
  let url: URL;
  try {
    url = new URL(task.pollingUrl);
  } catch {
    throw new DirectMediaProviderError(
      'PROVIDER_POLL_URL_INVALID',
      'BFL polling URL is unsupported.',
    );
  }
  const parameters = [...url.searchParams.entries()];
  if (
    !POLLING_ORIGINS.has(url.origin) ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== '/v1/get_result' ||
    parameters.length !== 1 ||
    parameters[0][0] !== 'id' ||
    parameters[0][1] !== task.externalId
  ) {
    throw new DirectMediaProviderError(
      'PROVIDER_POLL_URL_INVALID',
      'BFL polling URL is unsupported.',
    );
  }
  return task.pollingUrl;
}

function validatePreparedRequest(
  request: PreparedDirectMediaRequest,
): PreparedDirectMediaRequest {
  if (
    request.provider !== 'bfl' ||
    request.model !== 'flux-2-pro' ||
    request.contractVersion !== BFL_DIRECT_CONTRACT_VERSION ||
    request.endpoint !== 'https://api.bfl.ai/v1/flux-2-pro' ||
    !isRecord(request.body)
  ) {
    throw new DirectMediaProviderError(
      'DIRECT_MEDIA_INPUT_INVALID',
      'BFL prepared request is unsupported.',
    );
  }
  const body = request.body;
  const allowedKeys = new Set([
    'prompt',
    'output_format',
    'width',
    'height',
    'seed',
    'input_image',
    ...Array.from({ length: 7 }, (_, index) => `input_image_${index + 2}`),
  ]);
  if (
    Object.keys(body).some((key) => !allowedKeys.has(key)) ||
    body.output_format !== 'jpeg'
  ) {
    throw new DirectMediaProviderError(
      'DIRECT_MEDIA_INPUT_INVALID',
      'BFL prepared request is unsupported.',
    );
  }
  const references = [];
  let hasMissingReference = false;
  for (let index = 0; index < 8; index++) {
    const value =
      body[index === 0 ? 'input_image' : `input_image_${index + 1}`];
    if (value === undefined) {
      hasMissingReference = true;
      continue;
    }
    if (hasMissingReference || typeof value !== 'string') {
      throw new DirectMediaProviderError(
        'DIRECT_MEDIA_INPUT_INVALID',
        'BFL prepared request is unsupported.',
      );
    }
    references.push({ url: value });
  }
  // Reuse the compiler to validate runtime data; TypeScript types do not protect this boundary.
  const compiled = compileBflDirectRequest({
    model: request.model,
    mode: request.mode,
    prompt: body.prompt as string,
    references,
    width: body.width as number | undefined,
    height: body.height as number | undefined,
    seed: body.seed as number | undefined,
  });
  if (
    Object.keys(body).length !== Object.keys(compiled.body).length ||
    Object.keys(compiled.body).some((key) => body[key] !== compiled.body[key])
  ) {
    throw new DirectMediaProviderError(
      'DIRECT_MEDIA_INPUT_INVALID',
      'BFL prepared request is unsupported.',
    );
  }
  return compiled;
}

function validateSampleUrl(value: unknown): string {
  if (typeof value !== 'string') invalidResponse();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidResponse();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.port ||
    !/^delivery\.[a-z0-9-]+\.bfl\.ai$/.test(url.hostname)
  )
    invalidResponse();
  return value;
}

export class BflDirectClient implements DirectMediaClient {
  constructor(private readonly transport: DirectMediaTransport = fetch) {}

  async submit(
    request: PreparedDirectMediaRequest,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaSubmission> {
    requireCredential(context);
    const prepared = validatePreparedRequest(request);
    if (context.signal?.aborted) {
      throw new DirectMediaProviderError(
        'PROVIDER_CONNECTION_FAILED',
        'BFL submission was aborted before it started.',
      );
    }
    const body = JSON.stringify(prepared.body);
    context.onProviderSubmissionStarted?.();
    const response = await requestDirectMediaJson(
      this.transport,
      prepared.endpoint,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          'x-key': context.apiKey,
        },
        body,
        signal: context.signal,
      },
    );
    if (
      !isRecord(response) ||
      typeof response.id !== 'string' ||
      !response.id.trim() ||
      typeof response.polling_url !== 'string'
    ) {
      invalidResponse(true);
    }
    const task: DirectMediaTask = {
      externalId: response.id,
      pollingUrl: response.polling_url,
      model: prepared.model,
    };
    try {
      validatePollingUrl(task);
    } catch {
      invalidResponse(true);
    }
    return { kind: 'task', ...task };
  }

  async poll(
    task: DirectMediaTask,
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaPollResult> {
    requireCredential(context);
    const pollingUrl = validatePollingUrl(task);
    const response = await requestDirectMediaJson(this.transport, pollingUrl, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-key': context.apiKey },
      signal: context.signal,
    });
    if (!isRecord(response) || response.id !== task.externalId)
      invalidResponse();
    switch (response.status) {
      case 'Pending':
        return { status: 'queued' };
      case 'Reasoning':
      case 'Generating':
        return { status: 'running' };
      case 'Ready': {
        if (!isRecord(response.result)) invalidResponse();
        const sample = validateSampleUrl(response.result.sample);
        return {
          status: 'succeeded',
          outputs: [{ url: sample, mimeType: 'image/jpeg' }],
        };
      }
      case 'Request Moderated':
      case 'Content Moderated':
        return {
          status: 'failed',
          error: {
            code: 'PROVIDER_CONTENT_MODERATED',
            message: 'BFL moderated the image task.',
          },
        };
      case 'Task not found':
        return {
          status: 'failed',
          error: {
            code: 'PROVIDER_TASK_NOT_FOUND',
            message: 'BFL image task could not be found.',
          },
        };
      case 'Failed':
      case 'Error':
        return {
          status: 'failed',
          error: {
            code: 'PROVIDER_GENERATION_FAILED',
            message: 'BFL image generation failed.',
          },
        };
      default:
        invalidResponse();
    }
  }

  async cancel(
    _task: DirectMediaTask,
    _context: DirectMediaRequestContext,
  ): Promise<DirectMediaCancellation> {
    return { status: 'unsupported' };
  }

  async validateCredential(
    context: DirectMediaRequestContext,
  ): Promise<DirectMediaCredentialValidation> {
    try {
      requireCredential(context);
      const response = await requestDirectMediaJson(
        this.transport,
        'https://api.bfl.ai/v1/credits',
        {
          method: 'GET',
          headers: { accept: 'application/json', 'x-key': context.apiKey },
          signal: context.signal,
        },
      );
      if (
        !isRecord(response) ||
        typeof response.credits !== 'number' ||
        !Number.isFinite(response.credits)
      )
        invalidResponse();
      return { isValid: true };
    } catch (error: unknown) {
      return {
        isValid: false,
        error:
          error instanceof DirectMediaProviderError
            ? error.code
            : 'PROVIDER_CREDENTIAL_CHECK_FAILED',
      };
    }
  }
}

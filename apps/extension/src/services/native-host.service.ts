import {
  type NativeHostAction,
  type NativeHostFailureCode,
  type NativeHostGeneratedResponse,
  type NativeHostProviderId,
  type NativeHostProviderStatus,
  type NativeHostVoiceSnapshotV1,
  nativeHostResponseSchema,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import {
  NATIVE_HOST_GENERATION_TIMEOUT_MS,
  NATIVE_HOST_NAME,
  NATIVE_HOST_PROTOCOL_VERSION,
} from '@genfeedai/contracts/constants';
import { logger } from '~utils/logger.util';

/** Margin on top of the host's own timeout before the extension gives up waiting. */
const RESPONSE_MARGIN_MS = 10_000;
const DETECT_TIMEOUT_MS = 10_000;

export type NativeHostFailureKind =
  /** The browser could not start the host: not installed, wrong origin, or it exited. */
  | 'unreachable'
  /** The host answered, but with a failure or an answer that does not match the protocol. */
  | 'failed';

export class NativeHostError extends Error {
  constructor(
    message: string,
    readonly kind: NativeHostFailureKind,
    readonly code: NativeHostFailureCode | null = null,
  ) {
    super(message);
    this.name = 'NativeHostError';
  }
}

const UNREACHABLE_MESSAGE =
  'The Genfeed local bridge is not reachable. Run `gf host install` on this computer, reload the extension, then retry.';

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new NativeHostError(
            'The local provider did not answer in time.',
            'failed',
            'provider_timeout',
          ),
        ),
      timeoutMs,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function exchange(
  request: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await withTimeout(
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, request),
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof NativeHostError) throw error;
    // Chrome rejects when the host is missing, forbidden or exits without answering.
    logger.warn('Native host unreachable', error);
    throw new NativeHostError(UNREACHABLE_MESSAGE, 'unreachable');
  }
}

function parseResponse(raw: unknown, requestId: string) {
  const parsed = nativeHostResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new NativeHostError(
      'The local bridge answered in a way this extension does not understand. Update the Genfeed CLI.',
      'failed',
    );
  }
  const response = parsed.data;
  if (response.type === 'failed') {
    throw new NativeHostError(
      response.message,
      response.code === 'origin_not_allowed' ||
        response.code === 'unsupported_version'
        ? 'unreachable'
        : 'failed',
      response.code,
    );
  }
  if (response.requestId !== requestId) {
    throw new NativeHostError(
      'The local bridge answered a different request.',
      'failed',
    );
  }
  return response;
}

/** Asks the host which providers it can run. Nothing is executed and no prompt is sent. */
export async function detectNativeHost(): Promise<{
  hostVersion: string;
  providers: NativeHostProviderStatus[];
}> {
  const requestId = crypto.randomUUID();
  const response = parseResponse(
    await exchange(
      { requestId, type: 'detect', version: NATIVE_HOST_PROTOCOL_VERSION },
      DETECT_TIMEOUT_MS,
    ),
    requestId,
  );
  if (response.type !== 'detected') {
    throw new NativeHostError('Unexpected answer from the host.', 'failed');
  }
  return { hostVersion: response.hostVersion, providers: response.providers };
}

/**
 * Runs one text action on the chosen local provider. The brand voice travels
 * with the request; the host holds any provider key and never returns it.
 */
export async function runNativeHostAction(input: {
  action: NativeHostAction;
  providerId: NativeHostProviderId;
  voice: NativeHostVoiceSnapshotV1 | null;
}): Promise<NativeHostGeneratedResponse> {
  const requestId = crypto.randomUUID();
  const response = parseResponse(
    await exchange(
      {
        action: input.action,
        providerId: input.providerId,
        requestId,
        type: 'generate',
        version: NATIVE_HOST_PROTOCOL_VERSION,
        voice: input.voice,
      },
      NATIVE_HOST_GENERATION_TIMEOUT_MS + RESPONSE_MARGIN_MS,
    ),
    requestId,
  );
  if (
    response.type !== 'generated' ||
    response.providerId !== input.providerId ||
    response.action !== input.action.action
  ) {
    throw new NativeHostError('Unexpected answer from the host.', 'failed');
  }
  return response;
}

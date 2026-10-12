import type { Readable, Writable } from 'node:stream';
import {
  type NativeHostFailedResponse,
  type NativeHostFailureCode,
  type NativeHostResponse,
  nativeHostRequestSchema,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import {
  NATIVE_HOST_GENERATION_TIMEOUT_MS,
  NATIVE_HOST_MAX_REQUEST_BYTES,
  NATIVE_HOST_MAX_RESPONSE_BYTES,
  NATIVE_HOST_PROTOCOL_VERSION,
} from '@genfeedai/contracts/constants';
import type { FetchLike } from './api-providers';
import { HostConfigError, type HostPaths, readHostConfig } from './config';
import { detectProviders } from './detect';
import { HostFailure } from './failure';
import { FrameDecoder, FrameError, writeFrame } from './framing';
import { generateText } from './generate';

export interface HostRuntime {
  env: NodeJS.ProcessEnv;
  fetchImpl: FetchLike;
  homeDirectory: string;
  hostVersion: string;
  /** The origin the browser launched the host for (`chrome-extension://<id>/`). */
  origin: string | undefined;
  paths: HostPaths;
  stderr: Writable;
  stdin: Readable;
  stdout: Writable;
  /** Overrides the system-wide CLI locations searched after PATH. */
  systemDirectories?: readonly string[];
  timeoutMs?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function failed(
  requestId: string | null,
  code: NativeHostFailureCode,
  message: string
): NativeHostFailedResponse {
  return { code, message, requestId, type: 'failed', version: NATIVE_HOST_PROTOCOL_VERSION };
}

function readRequestId(frame: unknown): string | null {
  const candidate = (frame as { requestId?: unknown } | null)?.requestId;
  return typeof candidate === 'string' && UUID_PATTERN.test(candidate) ? candidate : null;
}

async function respondTo(
  frame: unknown,
  runtime: HostRuntime,
  abortSignal: AbortSignal
): Promise<NativeHostResponse> {
  const requestId = readRequestId(frame);
  const config = await readHostConfig(runtime.paths);
  if (!runtime.origin || !config.allowedOrigins.includes(runtime.origin)) {
    return failed(
      requestId,
      'origin_not_allowed',
      'This browser extension is not registered with the host. Run `gf host install`.'
    );
  }

  if ((frame as { version?: unknown } | null)?.version !== NATIVE_HOST_PROTOCOL_VERSION) {
    return failed(requestId, 'unsupported_version', 'Update the Genfeed CLI and the extension.');
  }
  const parsed = nativeHostRequestSchema.safeParse(frame);
  if (!parsed.success) {
    return failed(requestId, 'invalid_request', 'The request is not valid.');
  }
  const request = parsed.data;

  const environment = {
    homeDirectory: runtime.homeDirectory,
    pathValue: runtime.env.PATH,
    systemDirectories: runtime.systemDirectories,
  };
  if (request.type === 'detect') {
    return {
      hostVersion: runtime.hostVersion,
      providers: await detectProviders(environment, config),
      requestId: request.requestId,
      type: 'detected',
      version: NATIVE_HOST_PROTOCOL_VERSION,
    };
  }
  return generateText(request, {
    abortSignal,
    config,
    env: runtime.env,
    environment,
    fetchImpl: runtime.fetchImpl,
    timeoutMs: runtime.timeoutMs ?? NATIVE_HOST_GENERATION_TIMEOUT_MS,
  });
}

async function safeRespond(
  frame: unknown,
  runtime: HostRuntime,
  abortSignal: AbortSignal
): Promise<NativeHostResponse> {
  try {
    return await respondTo(frame, runtime, abortSignal);
  } catch (error) {
    const requestId = readRequestId(frame);
    if (error instanceof HostFailure) return failed(requestId, error.code, error.message);
    if (error instanceof HostConfigError) {
      return failed(requestId, 'internal_error', 'The host configuration is unreadable.');
    }
    runtime.stderr.write(
      `genfeed-host: unexpected error: ${error instanceof Error ? error.name : 'unknown'}\n`
    );
    return failed(requestId, 'internal_error', 'The host hit an unexpected error.');
  }
}

/**
 * Serves native messaging requests until the browser closes the pipe. A closed
 * pipe cancels the request in flight, which stops its child process. The host
 * answers only what the browser sends; it never calls Genfeed.
 */
export function runHost(runtime: HostRuntime): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cancellation = new AbortController();
    const decoder = new FrameDecoder(NATIVE_HOST_MAX_REQUEST_BYTES);
    let work: Promise<void> = Promise.resolve();
    let isReading = true;

    const enqueue = (task: () => Promise<void>): void => {
      work = work.then(task).catch(reject);
    };
    const send = async (response: NativeHostResponse): Promise<void> => {
      try {
        await writeFrame(runtime.stdout, response, NATIVE_HOST_MAX_RESPONSE_BYTES);
      } catch (error) {
        if (!(error instanceof FrameError)) throw error;
        await writeFrame(
          runtime.stdout,
          failed(
            'requestId' in response ? response.requestId : null,
            'internal_error',
            'The answer was too large to return.'
          ),
          NATIVE_HOST_MAX_RESPONSE_BYTES
        );
      }
    };
    // The stream is out of step with the peer, so nothing more can be read from it.
    const stopReading = (): void => {
      isReading = false;
      cancellation.abort();
      enqueue(async () => {
        await send(failed(null, 'invalid_request', 'The message could not be read.'));
        resolve();
      });
    };

    runtime.stdin.on('data', (chunk: Buffer) => {
      if (!isReading) return;
      let frames: unknown[];
      try {
        frames = decoder.push(chunk);
      } catch (error) {
        if (!(error instanceof FrameError)) return reject(error);
        return stopReading();
      }
      for (const frame of frames) {
        enqueue(async () => send(await safeRespond(frame, runtime, cancellation.signal)));
      }
    });
    runtime.stdin.once('end', () => {
      if (!isReading) return;
      cancellation.abort();
      try {
        decoder.finish();
      } catch {
        return stopReading();
      }
      enqueue(async () => resolve());
    });
    runtime.stdin.once('error', reject);
  });
}

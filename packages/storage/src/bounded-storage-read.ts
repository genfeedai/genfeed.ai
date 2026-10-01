import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { StorageReadOptions } from './storage.provider';
export const STORAGE_READ_MAX_BYTES = 20971520;
export type StorageReadErrorCode =
  | 'storage_read_invalid_options'
  | 'storage_read_invalid_key'
  | 'storage_read_limit_exceeded'
  | 'storage_read_aborted'
  | 'storage_read_timeout'
  | 'storage_read_unavailable'
  | 'storage_read_invalid_response'
  | 'storage_read_changed';
export class StorageReadError extends Error {
  constructor(readonly code: StorageReadErrorCode) {
    super(code);
    this.name = 'StorageReadError';
  }
}
export interface StorageReadContext {
  readonly maxBytes: number;
  readonly signal: AbortSignal;
  throwIfAborted(): void;
  abort(
    code:
      | 'storage_read_limit_exceeded'
      | 'storage_read_changed'
      | 'storage_read_invalid_response',
  ): void;
  dispose(): void;
}
export function createStorageReadContext(
  options: StorageReadOptions,
): StorageReadContext {
  if (
    !options ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes < 1 ||
    options.maxBytes > STORAGE_READ_MAX_BYTES ||
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    options.timeoutMs > 30000 ||
    (options.signal !== undefined && !(options.signal instanceof AbortSignal))
  )
    throw new StorageReadError('storage_read_invalid_options');
  const controller = new AbortController();
  const cancel = (code: StorageReadErrorCode) => {
    if (!controller.signal.aborted)
      controller.abort(new StorageReadError(code));
  };
  const external = () => cancel('storage_read_aborted');
  if (options.signal?.aborted) external();
  else options.signal?.addEventListener('abort', external, { once: true });
  const timer = setTimeout(
    () => cancel('storage_read_timeout'),
    options.timeoutMs,
  );
  let disposed = false;
  return {
    maxBytes: options.maxBytes,
    signal: controller.signal,
    throwIfAborted() {
      if (controller.signal.aborted) throw controller.signal.reason;
    },
    abort: cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', external);
    },
  };
}
export function normalizeStorageReadError(
  error: unknown,
  context: StorageReadContext,
): StorageReadError {
  if (error instanceof StorageReadError) return error;
  if (
    context.signal.aborted &&
    context.signal.reason instanceof StorageReadError
  )
    return context.signal.reason;
  if (error && typeof error === 'object') {
    const metadata = Object.getOwnPropertyDescriptor(error, '$metadata')?.value;
    if (
      metadata &&
      typeof metadata === 'object' &&
      Object.getOwnPropertyDescriptor(metadata, 'httpStatusCode')?.value === 412
    )
      return new StorageReadError('storage_read_changed');
  }
  return new StorageReadError('storage_read_unavailable');
}
export interface StorageReadBodyLifecycle {
  readonly supportsClose: boolean;
  close(error?: Error): Promise<void>;
}
export function observeStorageReadBody(
  body: Readable,
): StorageReadBodyLifecycle {
  let supportsClose = false;
  try {
    const state: unknown = Object.getOwnPropertyDescriptor(
      body,
      '_readableState',
    )?.value;
    supportsClose =
      state !== null &&
      typeof state === 'object' &&
      Reflect.get(state, 'emitClose') === true;
  } catch {
    supportsClose = false;
  }
  let cleanupError: Error | undefined =
    body.errored instanceof Error ? body.errored : undefined;
  const observeError = (error: unknown) => {
    cleanupError ??=
      error instanceof Error
        ? error
        : new StorageReadError('storage_read_unavailable');
  };
  body.on('error', observeError);
  const closed = supportsClose
    ? body.closed
      ? Promise.resolve()
      : new Promise<void>((resolve) => body.once('close', resolve))
    : undefined;
  const completion = finished(body, { cleanup: true }).catch(observeError);
  let cleanup: Promise<void> | undefined;
  return {
    supportsClose,
    close(error) {
      cleanup ??= (async () => {
        try {
          body.destroy(
            error ??
              (supportsClose
                ? undefined
                : new StorageReadError('storage_read_invalid_response')),
          );
        } catch (failure) {
          observeError(failure);
        }
        await closed;
        await completion;
        if (supportsClose) body.removeListener('error', observeError);
        if (cleanupError) throw cleanupError;
      })();
      return cleanup;
    },
  };
}
export async function collectBoundedStorageBytes(
  body: Readable,
  expectedSize: number,
  context: StorageReadContext,
  beforeClose?: () => Promise<void>,
  lifecycle: StorageReadBodyLifecycle = observeStorageReadBody(body),
): Promise<Buffer> {
  let result: Buffer | undefined;
  let primary: StorageReadError | undefined;
  const cancel = () => {
    void lifecycle
      .close(
        context.signal.reason instanceof Error
          ? context.signal.reason
          : new StorageReadError('storage_read_aborted'),
      )
      .catch(() => undefined);
  };
  context.signal.addEventListener('abort', cancel, { once: true });
  try {
    if (!lifecycle.supportsClose)
      throw new StorageReadError('storage_read_invalid_response');
    context.throwIfAborted();
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
      context.abort('storage_read_invalid_response');
      context.throwIfAborted();
    }
    if (expectedSize > context.maxBytes) {
      context.abort('storage_read_limit_exceeded');
      context.throwIfAborted();
    }
    result = Buffer.alloc(expectedSize);
    let seen = 0;
    for await (const chunk of body) {
      context.throwIfAborted();
      if (!(chunk instanceof Uint8Array)) {
        context.abort('storage_read_invalid_response');
        context.throwIfAborted();
      }
      if (
        seen + chunk.byteLength > expectedSize ||
        seen + chunk.byteLength > context.maxBytes
      ) {
        context.abort('storage_read_limit_exceeded');
        context.throwIfAborted();
      }
      result.set(chunk, seen);
      seen += chunk.byteLength;
    }
    context.throwIfAborted();
    if (seen !== expectedSize) {
      context.abort('storage_read_changed');
      context.throwIfAborted();
    }
    await beforeClose?.();
    context.throwIfAborted();
  } catch (error) {
    primary = normalizeStorageReadError(error, context);
  } finally {
    try {
      await lifecycle.close(primary);
    } catch (error) {
      primary ??= normalizeStorageReadError(error, context);
    } finally {
      context.signal.removeEventListener('abort', cancel);
    }
  }
  if (!primary) {
    try {
      context.throwIfAborted();
    } catch (error) {
      primary = normalizeStorageReadError(error, context);
    }
  }
  if (primary) throw primary;
  if (!result) throw new StorageReadError('storage_read_unavailable');
  return result;
}

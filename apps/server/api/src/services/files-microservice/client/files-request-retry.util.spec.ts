import {
  FILES_REQUEST_MAX_RETRIES,
  FilesRetryPolicy,
  isRetryableFilesError,
  sendFilesRequest,
} from '@api/services/files-microservice/client/files-request-retry.util';
import type { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

const withCode = (code: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(code), { code, ...extra });

const ok = (data: unknown) => of({ data } as AxiosResponse);

describe('isRetryableFilesError', () => {
  it.each([['ENOTFOUND'], ['EAI_AGAIN'], ['ECONNREFUSED']])(
    'retries %s under every retrying policy',
    (code) => {
      expect(
        isRetryableFilesError(withCode(code), FilesRetryPolicy.PRE_SEND),
      ).toBe(true);
      expect(
        isRetryableFilesError(withCode(code), FilesRetryPolicy.IDEMPOTENT),
      ).toBe(true);
    },
  );

  it.each([
    ['ECONNRESET'],
    ['EPIPE'],
    ['ETIMEDOUT'],
    ['ECONNABORTED'],
    ['UND_ERR_SOCKET'],
  ])('retries %s only for idempotent calls', (code) => {
    expect(
      isRetryableFilesError(withCode(code), FilesRetryPolicy.PRE_SEND),
    ).toBe(false);
    expect(
      isRetryableFilesError(withCode(code), FilesRetryPolicy.IDEMPOTENT),
    ).toBe(true);
  });

  it('reads the code from the error cause and from a socket hang up message', () => {
    expect(
      isRetryableFilesError(
        Object.assign(new Error('fetch failed'), {
          cause: { code: 'ECONNRESET' },
        }),
        FilesRetryPolicy.IDEMPOTENT,
      ),
    ).toBe(true);
    expect(
      isRetryableFilesError(
        new Error('socket hang up'),
        FilesRetryPolicy.IDEMPOTENT,
      ),
    ).toBe(true);
  });

  it('never retries when the policy is NONE or the body is a stream', () => {
    expect(
      isRetryableFilesError(withCode('ENOTFOUND'), FilesRetryPolicy.NONE),
    ).toBe(false);
    expect(
      isRetryableFilesError(
        withCode('ENOTFOUND'),
        FilesRetryPolicy.IDEMPOTENT,
        true,
      ),
    ).toBe(false);
  });

  it('never retries an HTTP status response or an unknown failure', () => {
    expect(
      isRetryableFilesError(
        withCode('ECONNRESET', { response: { status: 503 } }),
        FilesRetryPolicy.IDEMPOTENT,
      ),
    ).toBe(false);
    expect(
      isRetryableFilesError(new Error('boom'), FilesRetryPolicy.IDEMPOTENT),
    ).toBe(false);
    expect(isRetryableFilesError('nope', FilesRetryPolicy.IDEMPOTENT)).toBe(
      false,
    );
  });
});

describe('sendFilesRequest', () => {
  it('returns the first successful response without retrying', async () => {
    const execute = vi.fn(() => ok('first'));

    const response = await sendFilesRequest(execute, {
      baseDelayMs: 0,
      operation: 'test',
    });

    expect(response.data).toBe('first');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure, logs it, and returns the later success', async () => {
    const execute = vi
      .fn()
      .mockReturnValueOnce(throwError(() => withCode('ENOTFOUND')))
      .mockReturnValueOnce(ok('second'));
    const logger = { warn: vi.fn() };

    const response = await sendFilesRequest(execute, {
      baseDelayMs: 0,
      logger,
      operation: 'lookup',
    });

    expect(response.data).toBe('second');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Retrying files service request: lookup',
      { attempt: 1, code: 'ENOTFOUND' },
    );
  });

  it('stops after the retry cap and rethrows the last error', async () => {
    const failure = withCode('ECONNRESET');
    const execute = vi.fn(() => throwError(() => failure));

    await expect(
      sendFilesRequest(execute, {
        baseDelayMs: 0,
        operation: 'test',
        retryPolicy: FilesRetryPolicy.IDEMPOTENT,
      }),
    ).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(FILES_REQUEST_MAX_RETRIES + 1);
  });

  it('does not retry a mid-flight failure under the default policy', async () => {
    const execute = vi.fn(() => throwError(() => withCode('ECONNRESET')));

    await expect(
      sendFilesRequest(execute, { baseDelayMs: 0, operation: 'test' }),
    ).rejects.toThrowError('ECONNRESET');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the body is a stream', async () => {
    const execute = vi.fn(() => throwError(() => withCode('ENOTFOUND')));

    await expect(
      sendFilesRequest(execute, {
        baseDelayMs: 0,
        hasStreamBody: true,
        operation: 'test',
      }),
    ).rejects.toThrowError('ENOTFOUND');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('waits with jittered exponential backoff between attempts', async () => {
    vi.useFakeTimers();
    try {
      const execute = vi
        .fn()
        .mockReturnValueOnce(throwError(() => withCode('ENOTFOUND')))
        .mockReturnValueOnce(throwError(() => withCode('ENOTFOUND')))
        .mockReturnValueOnce(ok('done'));

      const result = sendFilesRequest(execute, {
        baseDelayMs: 100,
        operation: 'test',
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(execute).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toMatchObject({ data: 'done' });
      expect(execute).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

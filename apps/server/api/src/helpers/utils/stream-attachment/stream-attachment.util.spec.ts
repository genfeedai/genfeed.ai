import { EventEmitter } from 'node:events';
import { streamRemoteAttachment } from '@api/helpers/utils/stream-attachment/stream-attachment.util';
import { BadGatewayException, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

function response() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    set: vi.fn(),
    writableEnded: false,
  }) as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function pendingFetch() {
  const pending = deferred<Awaited<ReturnType<typeof fetch>>>();
  let options: RequestInit | undefined;
  const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => {
    options = init;
    init?.signal?.addEventListener(
      'abort',
      () => pending.reject(init?.signal?.reason),
      { once: true },
    );
    return pending.promise;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, pending, signal: () => options?.signal };
}

function mediaBody() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('media'));
      controller.close();
    },
  });
}

function expectNoListeners(res: Response) {
  expect(res.listenerCount('close')).toBe(0);
  expect(res.listenerCount('finish')).toBe(0);
}

describe('streamRemoteAttachment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams the remote file as an attachment with the given filename', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new globalThis.Response(mediaBody(), {
          headers: { 'content-type': 'image/png' },
        }),
      ),
    );
    const res = response();

    const result = await streamRemoteAttachment(
      'https://cdn.example/preview.png',
      'image-1-watermarked.png',
      res,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(res.set).toHaveBeenCalledWith({
      'Access-Control-Expose-Headers': 'Content-Disposition',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'attachment; filename="image-1-watermarked.png"',
      'Content-Type': 'image/png',
    });
    expectNoListeners(res);
    res.emit('close');
    const chunks: Buffer[] = [];
    for await (const chunk of result.getStream()) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('media');
  });

  it.each(['close', 'finish'] as const)(
    'aborts a pending fetch when the response emits %s',
    async (event) => {
      const res = response();
      const upstream = pendingFetch();
      const outcome = streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ).catch((error: unknown) => error);
      if (event === 'finish') Object.assign(res, { writableEnded: true });

      res.emit(event);
      const wasAborted = upstream.signal()?.aborted;
      upstream.pending.reject(new DOMException('Test cleanup', 'AbortError'));
      const error = await outcome;

      expect(wasAborted).toBe(true);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(res.set).not.toHaveBeenCalled();
      expectNoListeners(res);
    },
  );

  it.each(['destroyed', 'writableEnded'] as const)(
    'skips fetch for an already %s response',
    async (state) => {
      const res = response();
      Object.assign(res, { [state]: true });
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new globalThis.Response(mediaBody()));
      vi.stubGlobal('fetch', fetchMock);
      const outcome = await streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ).catch((error: unknown) => error);
      if (outcome instanceof StreamableFile) outcome.getStream().destroy();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ name: 'AbortError' });
      expect(res.set).not.toHaveBeenCalled();
      expectNoListeners(res);
    },
  );

  it.each(['close', 'finish', 'ended-state'] as const)(
    'cancels late upstream headers after response %s',
    async (event) => {
      const res = response();
      const pending = deferred<Awaited<ReturnType<typeof fetch>>>();
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
      const body = new ReadableStream<Uint8Array>();
      const cancel = vi.spyOn(body, 'cancel');
      const outcome = streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ).catch((error: unknown) => error);

      Object.assign(
        res,
        event === 'close' ? { destroyed: true } : { writableEnded: true },
      );
      if (event !== 'ended-state') res.emit(event);
      pending.resolve(new globalThis.Response(body));
      const result = await outcome;
      const cancelledBeforeCleanup = cancel.mock.calls.length;
      if (result instanceof StreamableFile) result.getStream().destroy();

      expect(cancelledBeforeCleanup).toBe(1);
      expect(result).toMatchObject({ name: 'AbortError' });
      expect(res.set).not.toHaveBeenCalled();
      expectNoListeners(res);
    },
  );

  it('cancels a failed HTTP response body before returning the existing gateway error', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi.spyOn(body, 'cancel');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new globalThis.Response(body, { status: 403 })),
    );
    const res = response();

    await expect(
      streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
    expect(res.set).not.toHaveBeenCalled();
    expectNoListeners(res);
  });

  it('keeps the gateway error if cancellation of a failed response rejects', async () => {
    const body = new ReadableStream<Uint8Array>();
    vi.spyOn(body, 'cancel').mockRejectedValue(new Error('cancel failed'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new globalThis.Response(body, { status: 403 })),
    );
    const res = response();

    await expect(
      streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expectNoListeners(res);
  });

  it('fails closed when a successful upstream response has no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new globalThis.Response(null)),
    );
    const res = response();

    await expect(
      streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(res.set).not.toHaveBeenCalled();
    expectNoListeners(res);
  });

  it('preserves a network failure and removes response listeners', async () => {
    const error = new Error('upstream failed');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    const res = response();

    await expect(
      streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ),
    ).rejects.toBe(error);
    expect(res.set).not.toHaveBeenCalled();
    expectNoListeners(res);
  });

  it('destroys an unhanded stream and preserves a header setup error', async () => {
    const cancel = vi.fn((_reason: unknown) => undefined);
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new globalThis.Response(body)),
    );
    const res = response();
    const error = new Error('headers unavailable');
    vi.mocked(res.set).mockImplementation(() => {
      throw error;
    });

    await expect(
      streamRemoteAttachment(
        'https://cdn.example/preview.png',
        'preview.png',
        res,
      ),
    ).rejects.toBe(error);
    await new Promise((resolve) => setImmediate(resolve));
    expect(cancel).toHaveBeenCalledTimes(1);
    expectNoListeners(res);
  });
});

import { downloadNftImage } from '@api/collections/images/services/nft-image-download.util';
import { safeFetch } from '@libs/security/destination-guard';
import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

function imageResponse(
  body: ConstructorParameters<typeof Response>[0],
  headers?: Record<string, string>,
  status = 200,
) {
  return new Response(body, {
    headers: { 'content-type': 'image/png', ...headers },
    status,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function bodyOf(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('Expected an image response body');
  return response.body;
}

function expectReleased(body: ReadableStream<Uint8Array>) {
  expect(body.locked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
}

describe('downloadNftImage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(safeFetch).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    'http://public.example/nft.png',
    'https://public.example/nft.png?signature=valid',
  ])(
    'uses the public destination guard and preserves bytes/MIME for %s',
    async (url) => {
      const response = imageResponse(new Uint8Array([1, 2, 3]));
      vi.mocked(safeFetch).mockResolvedValue(response);
      await expect(downloadNftImage(url, 3)).resolves.toEqual({
        contentType: 'image/png',
        data: Buffer.from([1, 2, 3]),
      });
      expect(safeFetch).toHaveBeenCalledWith(
        url,
        { signal: expect.any(AbortSignal) },
        { allowedSchemes: ['http:', 'https:'] },
      );
      expectReleased(bodyOf(response));
    },
  );

  it('preserves the JPEG fallback when Content-Type is absent', async () => {
    const response = new Response(new Uint8Array([1]));
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).resolves.toMatchObject({ contentType: 'image/jpeg' });
    expectReleased(bodyOf(response));
  });

  it('rejects a declared size overflow without reading the body', async () => {
    const response = imageResponse(new Uint8Array([1]), {
      'content-length': '4',
    });
    const cancel = vi.spyOn(bodyOf(response), 'cancel');
    const getReader = vi.spyOn(bodyOf(response), 'getReader');
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toThrow(/size|limit/i);
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(bodyOf(response));
  });

  it('bounds streamed bytes even when the declared length understates the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel,
    });
    vi.mocked(safeFetch).mockResolvedValue(
      imageResponse(body, { 'content-length': '1' }),
    );
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toThrow(/size|limit/i);
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(body);
  });

  it.each([
    { status: 503, contentType: 'image/png', error: /download/i },
    { status: 200, contentType: 'application/json', error: /not an image/i },
  ])(
    'rejects HTTP$status / $contentType and ignores a failing body cancellation',
    async ({ status, contentType, error }) => {
      const body = new ReadableStream<Uint8Array>();
      const cancel = vi
        .spyOn(body, 'cancel')
        .mockRejectedValue(new Error('cleanup failed'));
      vi.mocked(safeFetch).mockResolvedValue(
        imageResponse(body, { 'content-type': contentType }, status),
      );
      await expect(
        downloadNftImage('https://public.example/image', 3),
      ).rejects.toThrow(error);
      expect(cancel).toHaveBeenCalledTimes(1);
      expectReleased(body);
    },
  );

  it('does not let a stalled cleanup delay a policy rejection', async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => {}),
    });
    vi.mocked(safeFetch).mockResolvedValue(
      imageResponse(body, { 'content-type': 'application/json' }),
    );
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toThrow('NFT is not an image');
    expectReleased(body);
  });

  it('keeps the existing BadRequestException for non-image MIME', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      imageResponse(new Uint8Array([1]), { 'content-type': 'text/html' }),
    );
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing body', async () => {
    vi.mocked(safeFetch).mockResolvedValue(imageResponse(null));
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toThrow(/download/i);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves guard/network errors and clears the deadline', async () => {
    const error = new Error('guard rejected destination');
    vi.mocked(safeFetch).mockRejectedValue(error);
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects slow headers at 30 seconds and cancels a late response', async () => {
    const pending = deferred<Response>();
    vi.mocked(safeFetch).mockReturnValue(pending.promise);
    const outcome = downloadNftImage('https://public.example/image', 3).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await outcome).toMatchObject({
      message: 'NFT image download timed out',
    });
    const signal = vi.mocked(safeFetch).mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(true);
    const late = imageResponse(new Uint8Array([1]));
    const cancel = vi.spyOn(bodyOf(late), 'cancel');
    pending.resolve(late);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(bodyOf(late));
  });

  it('keeps the same 30-second deadline across headers and a stalled body', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cleanup failed'));
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(safeFetch).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      return imageResponse(body);
    });
    const outcome = downloadNftImage('https://public.example/image', 3).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatchObject({
      message: 'NFT image download timed out',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(body);
  });

  it('preserves a body read error and releases its reader', async () => {
    const error = new Error('body transfer failed');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    });
    vi.mocked(safeFetch).mockResolvedValue(imageResponse(body));
    await expect(
      downloadNftImage('https://public.example/image', 3),
    ).rejects.toBe(error);
    expectReleased(body);
  });
});

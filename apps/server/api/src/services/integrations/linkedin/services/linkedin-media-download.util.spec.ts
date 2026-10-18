import { downloadLinkedInMedia } from '@api/services/integrations/linkedin/services/linkedin-media-download.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import * as mediaSpecs from '@genfeedai/contracts/constants';
import { safeFetch } from '@libs/security/destination-guard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

function bodyOf(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('Expected a media response body');
  return response.body;
}

function expectReleased(body: ReadableStream<Uint8Array>) {
  expect(body.locked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const configuredMediaUrl = 'http://media.internal:9000/ingredients';
const configuredUrl = `${configuredMediaUrl}/images/key?signature=valid`;
const publicOptions = { allowedSchemes: ['http:', 'https:'] };

describe('downloadLinkedInMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(safeFetch).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    'http://public.example/media',
    'https://public.example/media?signature=valid',
  ])('preserves public URL and media bytes for %s', async (url) => {
    const response = new Response(new Uint8Array([1, 2, 3]));
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(downloadLinkedInMedia(url, 'image')).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(safeFetch).toHaveBeenCalledWith(
      url,
      { signal: expect.any(AbortSignal) },
      publicOptions,
    );
    expectReleased(bodyOf(response));
  });

  it('never upgrades untrusted caller trust because its URL equals private configured storage', async () => {
    const error = new Error('private destination rejected');
    vi.mocked(safeFetch).mockRejectedValue(error);
    await expect(
      downloadLinkedInMedia(configuredUrl, 'image', configuredMediaUrl),
    ).rejects.toBe(error);
    expect(safeFetch).toHaveBeenCalledWith(
      configuredUrl,
      { signal: expect.any(AbortSignal) },
      publicOptions,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows only the exact configured origin for explicit publisher media and pins redirects to it', async () => {
    const response = new Response(new Uint8Array([1]));
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(
      downloadLinkedInMedia(
        configuredUrl,
        'image',
        configuredMediaUrl,
        'publisher',
      ),
    ).resolves.toEqual(Buffer.from([1]));
    expect(safeFetch).toHaveBeenCalledWith(
      configuredUrl,
      { signal: expect.any(AbortSignal) },
      {
        ...publicOptions,
        allowedOrigins: ['http://media.internal:9000'],
        allowPrivateNetwork: true,
      },
    );
    expectReleased(bodyOf(response));
  });

  it.each([
    'http://media.internal:9001/image',
    'http://other.internal:9000/image',
  ])('does not expand trusted publisher admission to %s', async (url) => {
    const error = new Error('private destination rejected');
    vi.mocked(safeFetch).mockRejectedValue(error);
    await expect(
      downloadLinkedInMedia(url, 'image', configuredMediaUrl, 'publisher'),
    ).rejects.toBe(error);
    expect(safeFetch).toHaveBeenCalledWith(
      url,
      { signal: expect.any(AbortSignal) },
      publicOptions,
    );
  });

  it.each([
    { mediaType: 'image', limit: 10 * 1024 * 1024 },
    { mediaType: 'video', limit: 500 * 1024 * 1024 },
  ] as const)(
    'uses the existing $mediaType platform ceiling without allocating that payload',
    async ({ mediaType, limit }) => {
      const response = new Response(new Uint8Array([1]), {
        headers: { 'content-length': String(limit + 1) },
      });
      const cancel = vi.spyOn(bodyOf(response), 'cancel');
      const getReader = vi.spyOn(bodyOf(response), 'getReader');
      vi.mocked(safeFetch).mockResolvedValue(response);
      await expect(
        downloadLinkedInMedia('https://public.example/media', mediaType),
      ).rejects.toThrow(/size limit/);
      expect(getReader).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(1);
      expectReleased(bodyOf(response));
    },
  );

  it('bounds observed bytes even if Content-Length understates the body', async () => {
    const spec = mediaSpecs.getPlatformMediaSpec(
      CredentialPlatform.LINKEDIN,
      'image',
    );
    if (!spec) throw new Error('Missing LinkedIn image spec');
    vi.spyOn(mediaSpecs, 'getPlatformMediaSpec').mockReturnValue({
      ...spec,
      maxFileSizeBytes: 3,
    });
    const cancel = vi.fn().mockRejectedValue(new Error('cleanup failed'));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel,
    });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, { headers: { 'content-length': '1' } }),
    );
    await expect(
      downloadLinkedInMedia('https://public.example/media', 'image'),
    ).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(body);
  });

  it('does not wait for a stuck cancellation or mask an HTTP failure', async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => {}),
    });
    vi.mocked(safeFetch).mockResolvedValue(new Response(body, { status: 503 }));
    await expect(
      downloadLinkedInMedia('https://public.example/media', 'image'),
    ).rejects.toThrow('LinkedIn media download failed');
    expectReleased(body);
  });

  it('rejects a missing response body', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(null));
    await expect(
      downloadLinkedInMedia('https://public.example/media', 'video'),
    ).rejects.toThrow('LinkedIn media download failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a network error and clears its deadline', async () => {
    const error = new Error('transfer failed');
    vi.mocked(safeFetch).mockRejectedValue(error);
    await expect(
      downloadLinkedInMedia('https://public.example/media', 'video'),
    ).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts slow headers at 120 seconds and cancels a late response', async () => {
    const pending = deferred<Response>();
    vi.mocked(safeFetch).mockReturnValue(pending.promise);
    const outcome = downloadLinkedInMedia(
      'https://public.example/media',
      'video',
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await outcome).toMatchObject({
      message: 'LinkedIn media download timed out',
    });
    expect(vi.mocked(safeFetch).mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    const late = new Response(new Uint8Array([1]));
    const cancel = vi
      .spyOn(bodyOf(late), 'cancel')
      .mockRejectedValue(new Error('cleanup failed'));
    pending.resolve(late);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(bodyOf(late));
  });

  it('keeps one deadline across header arrival and stalled body cleanup', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('cleanup failed'));
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(safeFetch).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100_000));
      return new Response(body);
    });
    const outcome = downloadLinkedInMedia(
      'https://public.example/media',
      'video',
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatchObject({
      message: 'LinkedIn media download timed out',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(body);
  });

  it('preserves body read failure while releasing the reader', async () => {
    const error = new Error('body failed');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    });
    vi.mocked(safeFetch).mockResolvedValue(new Response(body));
    await expect(
      downloadLinkedInMedia('https://public.example/media', 'image'),
    ).rejects.toBe(error);
    expectReleased(body);
  });
});

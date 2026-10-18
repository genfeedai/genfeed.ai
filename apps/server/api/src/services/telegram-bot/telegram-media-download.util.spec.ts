import {
  downloadTelegramMedia,
  TelegramMediaDownloadError,
  toTelegramAbortSignal,
} from '@api/services/telegram-bot/telegram-media-download.util';
import { safeFetch } from '@libs/security/destination-guard';
import { Api } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

const token = '123456:fixture-secret';
const filePath = 'voice/sample.ogg';
const sourceUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
const maxBytes = 20 * 1024 * 1024;
type TelegramFetchOptions = {
  signal?: ReturnType<typeof toTelegramAbortSignal>;
};

function bodyOf(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error('Expected response body');
  return response.body;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function expectReleased(body?: ReadableStream<Uint8Array>) {
  if (body) expect(body.locked).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
}

describe('downloadTelegramMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(safeFetch).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps exact source bytes, path, and content type behind public HTTPS Telegram admission', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'audio/ogg' },
    });
    const getFile = vi
      .fn()
      .mockResolvedValue({ file_path: filePath, file_size: 3 });
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(downloadTelegramMedia(token, getFile)).resolves.toEqual({
      data: Buffer.from([1, 2, 3]),
      contentType: 'audio/ogg',
      filePath,
    });
    expect(safeFetch).toHaveBeenCalledWith(
      sourceUrl,
      { signal: expect.any(AbortSignal) },
      {
        allowedSchemes: ['https:'],
        allowedOrigins: ['https://api.telegram.org'],
      },
    );
    expect(getFile.mock.calls[0]?.[0]).toBe(
      vi.mocked(safeFetch).mock.calls[0]?.[1]?.signal,
    );
    expectReleased(bodyOf(response));
  });

  it('aborts the real SDK metadata request with a native signal and removes its listener', async () => {
    const added = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const removed = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    const aborted = vi.fn();
    const blockedFetch = vi.fn(
      (_url: unknown, options?: TelegramFetchOptions) =>
        new Promise<never>((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) {
            reject(new Error('Expected SDK request signal'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              aborted();
              reject(new Error('Mock transport canceled'));
            },
            { once: true },
          );
        }),
    );
    const api = new Api(token, { fetch: blockedFetch });
    const pending = downloadTelegramMedia(token, (signal) =>
      api.getFile('fixture-file', toTelegramAbortSignal(signal)),
    );
    const result = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    expect(blockedFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    await result;
    expect(aborted).toHaveBeenCalledTimes(1);
    const abortRegistration = added.mock.calls.find(
      ([name]) => name === 'abort',
    );
    expect(abortRegistration).toBeDefined();
    expect(removed).toHaveBeenCalledWith('abort', abortRegistration?.[1]);
    expect(safeFetch).not.toHaveBeenCalled();
    expectReleased();
  });

  it('permits absent MIME metadata and an advertised size equal to the upstream ceiling', async () => {
    const response = new Response(new Uint8Array([1]), {
      headers: { 'content-length': String(maxBytes) },
    });
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(
      downloadTelegramMedia(token, async () => ({
        file_path: filePath,
        file_size: maxBytes,
      })),
    ).resolves.toEqual({ data: Buffer.from([1]), contentType: null, filePath });
    expectReleased(bodyOf(response));
  });

  it('rejects known metadata overflow before source fetch', async () => {
    await expect(
      downloadTelegramMedia(token, async () => ({
        file_path: filePath,
        file_size: maxBytes + 1,
      })),
    ).rejects.toMatchObject({ kind: 'too-large' });
    expect(safeFetch).not.toHaveBeenCalled();
    expectReleased();
  });

  it('rejects missing paths with a safe typed failure before source fetch', async () => {
    await expect(
      downloadTelegramMedia(token, async () => ({})),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Telegram file too large: file_path not returned by API',
    });
    expect(safeFetch).not.toHaveBeenCalled();
    expectReleased();
  });

  it('rejects an unavailable token without metadata or HTTP calls', async () => {
    const getFile = vi.fn();
    await expect(
      downloadTelegramMedia(undefined, getFile),
    ).rejects.toBeInstanceOf(TelegramMediaDownloadError);
    expect(getFile).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
    expectReleased();
  });

  it('rejects declared overflow before acquiring a reader and cancels its body', async () => {
    const response = new Response(new Uint8Array([1]), {
      headers: { 'content-length': String(maxBytes + 1) },
    });
    const cancel = vi.spyOn(bodyOf(response), 'cancel');
    const getReader = vi.spyOn(bodyOf(response), 'getReader');
    vi.mocked(safeFetch).mockResolvedValue(response);
    await expect(
      downloadTelegramMedia(token, async () => ({ file_path: filePath })),
    ).rejects.toMatchObject({ kind: 'too-large' });
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(bodyOf(response));
  });

  it('bounds observed bytes when headers understate the response, without waiting for stuck cancellation', async () => {
    const cancel = vi.fn().mockReturnValue(new Promise(() => {}));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(maxBytes + 1));
      },
      cancel,
    });
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, { headers: { 'content-length': '1' } }),
    );
    await expect(
      downloadTelegramMedia(token, async () => ({ file_path: filePath })),
    ).rejects.toMatchObject({ kind: 'too-large' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(body);
  });

  it('cancels unsuccessful responses without awaiting broken cleanup', async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise(() => {}),
    });
    vi.mocked(safeFetch).mockResolvedValue(new Response(body, { status: 503 }));
    await expect(
      downloadTelegramMedia(token, async () => ({ file_path: filePath })),
    ).rejects.toMatchObject({
      kind: 'failed',
      message: 'Telegram file download failed: 503',
    });
    expectReleased(body);
  });

  it('rejects an absent body and releases its deadline', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(null));
    await expect(
      downloadTelegramMedia(token, async () => ({ file_path: filePath })),
    ).rejects.toMatchObject({ kind: 'failed' });
    expectReleased();
  });

  it.each(['metadata', 'source'] as const)(
    'contains raw %s errors with tokenized URLs and request causes',
    async (stage) => {
      const raw = new Error(`request failed at ${sourceUrl}`, {
        cause: { url: sourceUrl, token },
      });
      const getFile =
        stage === 'metadata'
          ? async () => {
              throw raw;
            }
          : async () => ({ file_path: filePath });
      vi.mocked(safeFetch).mockRejectedValue(raw);
      const error = await downloadTelegramMedia(token, getFile).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(TelegramMediaDownloadError);
      expect(error).toMatchObject({ kind: 'failed' });
      expect(error).not.toHaveProperty('cause');
      expect(String(error)).not.toContain(token);
      expect(String(error)).not.toContain(sourceUrl);
      expectReleased();
    },
  );

  it('ends stalled metadata at 120 seconds without starting a source request', async () => {
    const getFile = vi.fn().mockReturnValue(new Promise(() => {}));
    const outcome = downloadTelegramMedia(token, getFile).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await outcome).toMatchObject({ kind: 'timeout' });
    expect(getFile.mock.calls[0]?.[0]?.aborted).toBe(true);
    expect(safeFetch).not.toHaveBeenCalled();
    expectReleased();
  });

  it('cancels late headers after the transfer deadline', async () => {
    const pending = deferred<Response>();
    vi.mocked(safeFetch).mockReturnValue(pending.promise);
    const outcome = downloadTelegramMedia(token, async () => ({
      file_path: filePath,
    })).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await outcome).toMatchObject({ kind: 'timeout' });
    const response = new Response(new Uint8Array([1]));
    const cancel = vi
      .spyOn(bodyOf(response), 'cancel')
      .mockRejectedValue(new Error('cleanup failed'));
    pending.resolve(response);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expectReleased(bodyOf(response));
  });

  it('shares the 120-second budget across metadata, headers, and stalled body reads', async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel: vi.fn().mockRejectedValue(new Error('cleanup failed')),
    });
    const getFile = async () => {
      await new Promise((resolve) => setTimeout(resolve, 80_000));
      return { file_path: filePath };
    };
    vi.mocked(safeFetch).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      return new Response(body);
    });
    const outcome = downloadTelegramMedia(token, getFile).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(100_000);
    expect(body.locked).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toMatchObject({ kind: 'timeout' });
    expectReleased(body);
  });

  it('contains a body read failure and releases its reader', async () => {
    const raw = new Error(`body failed at ${sourceUrl}`);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(raw);
      },
    });
    vi.mocked(safeFetch).mockResolvedValue(new Response(body));
    await expect(
      downloadTelegramMedia(token, async () => ({ file_path: filePath })),
    ).rejects.toMatchObject({
      kind: 'failed',
      message: 'Telegram file download failed',
    });
    expectReleased(body);
  });
});

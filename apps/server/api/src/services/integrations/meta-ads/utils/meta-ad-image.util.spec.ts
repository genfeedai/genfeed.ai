import { readMetaAdImageBytes } from '@api/services/integrations/meta-ads/utils/meta-ad-image.util';
import { safeFetch } from '@libs/security/destination-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('Meta ad image reader cleanup', () => {
  it('does not wait for an unread failed response cancellation to settle', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.mocked(safeFetch).mockResolvedValue(new Response(body, { status: 503 }));

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).rejects.toThrow('The ad image could not be downloaded.');
    expect(cancel).toHaveBeenCalledOnce();
  }, 500);

  it('preserves the download error when an unread error body cannot cancel', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi
      .spyOn(body, 'cancel')
      .mockRejectedValue(new Error('secondary cancellation error'));
    vi.mocked(safeFetch).mockResolvedValue(new Response(body, { status: 503 }));

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).rejects.toThrow('The ad image could not be downloaded.');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves the validation error when a rejected image cannot cancel', async () => {
    const body = new ReadableStream<Uint8Array>();
    const cancel = vi
      .spyOn(body, 'cancel')
      .mockRejectedValue(new Error('secondary cancellation error'));
    vi.mocked(safeFetch).mockResolvedValue(
      new Response(body, { headers: { 'content-type': 'text/html' } }),
    );

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).rejects.toThrow(
      'Meta ad images must be JPEG or PNG and no larger than 30 MB.',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves the transfer error and releases the incomplete reader', async () => {
    const failure = new Error('image transfer interrupted');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    const response = new Response(body, {
      headers: { 'content-type': 'image/jpeg' },
    });
    const reader = body.getReader();
    vi.spyOn(body, 'getReader').mockReturnValue(reader);
    const cancel = vi
      .spyOn(reader, 'cancel')
      .mockRejectedValue(new Error('secondary cancellation error'));
    const release = vi.spyOn(reader, 'releaseLock');
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).rejects.toBe(failure);
    expect(cancel).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('preserves a streamed size failure even when cleanup rejects', async () => {
    const chunk = new Uint8Array([1]);
    Object.defineProperty(chunk, 'byteLength', { value: 31 * 1024 * 1024 });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
      },
    });
    const response = new Response(body, {
      headers: { 'content-type': 'image/png' },
    });
    const reader = body.getReader();
    vi.spyOn(body, 'getReader').mockReturnValue(reader);
    const cancel = vi
      .spyOn(reader, 'cancel')
      .mockRejectedValue(new Error('secondary cancellation error'));
    const release = vi.spyOn(reader, 'releaseLock');
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).rejects.toThrow('Meta ad image exceeds the 30 MB limit.');
    expect(cancel).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('releases a completed image and returns the original base64 without cancellation', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('image'));
        controller.close();
      },
    });
    const response = new Response(body, {
      headers: { 'content-type': 'image/jpeg' },
    });
    const reader = body.getReader();
    vi.spyOn(body, 'getReader').mockReturnValue(reader);
    const cancel = vi
      .spyOn(reader, 'cancel')
      .mockRejectedValue(new Error('completed reader cannot cancel'));
    const release = vi.spyOn(reader, 'releaseLock');
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(
      readMetaAdImageBytes('https://cdn.example/image.jpg'),
    ).resolves.toBe(Buffer.from('image').toString('base64'));
    expect(cancel).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(safeFetch).toHaveBeenCalledWith(
      'https://cdn.example/image.jpg',
      { signal: expect.any(AbortSignal) },
      { allowedSchemes: ['https:'] },
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.hoisted(() => vi.fn());

vi.mock('@libs/security/destination-guard', () => ({ safeFetch }));

import { downloadBounded } from '@libs/security/bounded-download';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const baseOptions = {
  createError: (reason: 'failed' | 'too-large') => new Error(reason),
  deadlineMs: 1_000,
  destination: {},
  maxBytes: 8,
  timeoutError: new Error('timed out'),
};

describe('downloadBounded', () => {
  afterEach(() => {
    vi.useRealTimers();
    safeFetch.mockReset();
  });

  it('returns the body and headers of a response within the limit', async () => {
    safeFetch.mockResolvedValue(
      new Response(streamOf('ab', 'cd'), {
        headers: { 'content-type': 'image/png' },
      }),
    );

    const download = await downloadBounded(
      'https://example.com/a',
      baseOptions,
    );

    expect(download.data.toString()).toBe('abcd');
    expect(download.headers.get('content-type')).toBe('image/png');
  });

  it('rejects a body that outgrows the limit despite a missing length', async () => {
    safeFetch.mockResolvedValue(new Response(streamOf('abcde', 'fghij')));

    await expect(
      downloadBounded('https://example.com/a', baseOptions),
    ).rejects.toThrow('too-large');
  });

  it('rejects a declared length over the limit without reading the body', async () => {
    const body = streamOf('x');
    const cancel = vi.spyOn(body, 'cancel');
    safeFetch.mockResolvedValue(
      new Response(body, { headers: { 'content-length': '9' } }),
    );

    await expect(
      downloadBounded('https://example.com/a', baseOptions),
    ).rejects.toThrow('too-large');
    expect(cancel).toHaveBeenCalled();
  });

  it('fails a non-OK response', async () => {
    safeFetch.mockResolvedValue(new Response('no', { status: 500 }));

    await expect(
      downloadBounded('https://example.com/a', baseOptions),
    ).rejects.toThrow('failed');
  });

  it('lets inspect reject a response before its body is read', async () => {
    safeFetch.mockResolvedValue(new Response(streamOf('ab')));

    await expect(
      downloadBounded('https://example.com/a', {
        ...baseOptions,
        inspect: () => {
          throw new Error('not an image');
        },
      }),
    ).rejects.toThrow('not an image');
  });

  it('throws the configured timeout error when the deadline passes', async () => {
    vi.useFakeTimers();
    safeFetch.mockReturnValue(new Promise(() => undefined));

    const download = downloadBounded('https://example.com/a', baseOptions);
    const assertion = expect(download).rejects.toBe(baseOptions.timeoutError);
    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
  });

  it('resolves a lazy url under the same deadline', async () => {
    safeFetch.mockResolvedValue(new Response(streamOf('ok')));

    const download = await downloadBounded(
      async ({ race }) => race(Promise.resolve('https://example.com/lazy')),
      baseOptions,
    );

    expect(safeFetch).toHaveBeenCalledWith(
      'https://example.com/lazy',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      baseOptions.destination,
    );
    expect(download.data.toString()).toBe('ok');
  });
});

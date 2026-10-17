import {
  fetchKnowledgeBytes,
  KnowledgeFetchProhibitedError,
} from '@api/collections/contexts/utils/knowledge-bounded-fetch.util';
import { safeFetch } from '@libs/security/destination-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));

const referenceUrl = 'https://example.com/source?signature=preserved';

function getResponseBody(response: Response) {
  if (!response.body) throw new Error('Test response must have a body');
  return response.body;
}

function trackedResponse(chunks: number[][], failure?: Error) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (failure) {
        controller.error(failure);
        return;
      }
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  });
  const response = new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
  const reader = stream.getReader();
  vi.spyOn(stream, 'getReader').mockReturnValue(reader);
  const cancel = vi.spyOn(reader, 'cancel');
  const release = vi.spyOn(reader, 'releaseLock');
  return { cancel, reader, release, response, stream };
}

describe('fetchKnowledgeBytes reader lifecycle', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns identical bytes and metadata while releasing a completed reader', async () => {
    const tracked = trackedResponse([
      [1, 2],
      [3, 4],
    ]);
    vi.mocked(safeFetch).mockResolvedValue(tracked.response);

    await expect(
      fetchKnowledgeBytes({ maxBytes: 4, referenceUrl }),
    ).resolves.toEqual({
      bytes: Buffer.from([1, 2, 3, 4]),
      finalUrl: referenceUrl,
      mimeType: 'text/plain',
      status: 200,
    });
    expect(tracked.cancel).not.toHaveBeenCalled();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
    expect(safeFetch).toHaveBeenCalledWith(referenceUrl, {
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    });
  });

  it('releases an overflowing reader and preserves the size error if cancellation rejects', async () => {
    const tracked = trackedResponse([[1, 2, 3, 4, 5]]);
    tracked.cancel.mockRejectedValue(
      new Error('secondary cancellation failure'),
    );
    vi.mocked(safeFetch).mockResolvedValue(tracked.response);

    await expect(
      fetchKnowledgeBytes({ maxBytes: 4, referenceUrl }),
    ).rejects.toThrow('The source exceeds the ingest size limit');
    expect(tracked.cancel).toHaveBeenCalledOnce();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
  });

  it('does not wait for a stuck overflow cancellation', async () => {
    const tracked = trackedResponse([[1, 2, 3, 4, 5]]);
    tracked.cancel.mockReturnValue(new Promise(() => {}));
    vi.mocked(safeFetch).mockResolvedValue(tracked.response);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        fetchKnowledgeBytes({ maxBytes: 4, referenceUrl, timeoutMs: 20 }).then(
          () => 'unexpected success',
          (error: unknown) =>
            error instanceof Error ? error.message : 'unexpected error',
        ),
        new Promise<string>((resolve) => {
          deadline = setTimeout(() => resolve('blocked by cleanup'), 100);
        }),
      ]);
      expect(outcome).toBe('The source exceeds the ingest size limit');
      expect(tracked.release).toHaveBeenCalledOnce();
      expect(tracked.stream.locked).toBe(false);
    } finally {
      clearTimeout(deadline);
    }
  });

  it('cancels an incomplete errored stream and releases its reader without masking the transfer error', async () => {
    const original = new Error('source transport disconnected');
    const tracked = trackedResponse([], original);
    tracked.cancel.mockRejectedValue(new Error('secondary cleanup error'));
    vi.mocked(safeFetch).mockResolvedValue(tracked.response);

    await expect(fetchKnowledgeBytes({ referenceUrl })).rejects.toBe(original);
    expect(tracked.cancel).toHaveBeenCalledOnce();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
  });

  it.each([401, 403, 451])(
    'cancels an unread prohibited %s body and preserves the error class',
    async (status) => {
      const response = new Response('denied', { status });
      const cancel = vi
        .spyOn(getResponseBody(response), 'cancel')
        .mockRejectedValue(new Error('cleanup failed'));
      vi.mocked(safeFetch).mockResolvedValue(response);

      const result = fetchKnowledgeBytes({ referenceUrl });
      await expect(result).rejects.toBeInstanceOf(
        KnowledgeFetchProhibitedError,
      );
      await expect(result).rejects.toMatchObject({ status });
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it('cancels an unread failed HTTP body without changing the status error', async () => {
    const response = new Response('unavailable', { status: 503 });
    const cancel = vi
      .spyOn(getResponseBody(response), 'cancel')
      .mockReturnValue(new Promise(() => {}));
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(fetchKnowledgeBytes({ referenceUrl })).rejects.toThrow(
      'Failed to fetch source (503)',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels an unread oversized declared body without acquiring a reader', async () => {
    const response = new Response('bytes', {
      headers: { 'content-length': '5' },
    });
    const cancel = vi
      .spyOn(getResponseBody(response), 'cancel')
      .mockRejectedValue(new Error('cleanup failed'));
    const getReader = vi.spyOn(getResponseBody(response), 'getReader');
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(
      fetchKnowledgeBytes({ maxBytes: 4, referenceUrl }),
    ).rejects.toThrow('The source exceeds the ingest size limit');
    expect(cancel).toHaveBeenCalledOnce();
    expect(getReader).not.toHaveBeenCalled();
  });

  it('preserves the bodyless fallback', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(null));
    await expect(fetchKnowledgeBytes({ referenceUrl })).resolves.toEqual({
      bytes: Buffer.alloc(0),
      finalUrl: referenceUrl,
      mimeType: '',
      status: 200,
    });
  });

  it('preserves the established timeout error', async () => {
    vi.mocked(safeFetch).mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    );
    await expect(fetchKnowledgeBytes({ referenceUrl })).rejects.toThrow(
      'The source timed out',
    );
  });
});

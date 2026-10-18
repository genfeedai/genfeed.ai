import { deflateSync } from 'node:zlib';
import {
  extractHtmlText,
  extractPdfText,
  extractSourceText,
  KNOWLEDGE_SOURCE_MAX_BYTES,
  PDF_MAX_EXTRACTED_CHARS,
  UnsupportedKnowledgeSourceError,
} from '@api/collections/contexts/utils/extract-source-text.util';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { DestinationGuardError } from '@libs/security/destination-guard';

const referenceUrl = 'https://docs.example.com/source.txt?signature=preserved';
const sizeError = `Source exceeds the ${KNOWLEDGE_SOURCE_MAX_BYTES} byte ingest limit`;

function getResponseBody(response: Response) {
  if (!response.body) throw new Error('Test response must have a body');
  return response.body;
}

function trackedResponse(
  chunks: Uint8Array[],
  headers?: HeadersInit,
  failure?: Error,
) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (failure) {
        controller.error(failure);
        return;
      }
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const response = new Response(stream, { headers });
  const getReader = stream.getReader.bind(stream);
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const reader = () => {
    if (!activeReader) throw new Error('Source reader has not been acquired');
    return activeReader;
  };
  const cancel = vi.fn((reason?: unknown) => reader().cancel(reason));
  const read = vi.fn(() => reader().read());
  const release = vi.fn(() => reader().releaseLock());
  vi.spyOn(stream, 'getReader').mockImplementation(() => {
    activeReader = getReader();
    return { cancel, closed: activeReader.closed, read, releaseLock: release };
  });
  return {
    arrayBuffer: vi.spyOn(response, 'arrayBuffer'),
    cancel,
    read,
    release,
    response,
    stream,
  };
}

describe('extractHtmlText', () => {
  it('strips scripts and collapses body copy', () => {
    const html = `
      <html>
        <head><title>Acme</title><script>alert(1)</script></head>
        <body>
          <style>.x{}</style>
          <h1>Brand kit</h1>
          <p>We ship calm, useful copy.</p>
        </body>
      </html>
    `;

    expect(extractHtmlText(html)).toBe(
      'Acme Brand kit We ship calm, useful copy.',
    );
  });
});

describe('extractPdfText', () => {
  it('reads uncompressed Tj literals', () => {
    const pdf = Buffer.from(
      '%PDF-1.1\nBT /F1 12 Tf (Hello knowledge document) Tj ET\n%%EOF',
      'latin1',
    );

    expect(extractPdfText(pdf)).toBe('Hello knowledge document');
  });

  it('reads text from a compressed stream under both inflate limits', () => {
    const payload = deflateSync(Buffer.from('(Compressed hello) Tj', 'latin1'));
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.1\nstream\n', 'latin1'),
      payload,
      Buffer.from('\nendstream\n%%EOF', 'latin1'),
    ]);

    expect(extractPdfText(pdf)).toBe('Compressed hello');
  });

  it('stops once cumulative inflation would pass the document budget', () => {
    const chunk = deflateSync(Buffer.alloc(9 * 1024 * 1024, 0x20));
    const later = deflateSync(Buffer.from('(later marker) Tj', 'latin1'));
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.1\nBT (seed) Tj ET\nstream\n', 'latin1'),
      chunk,
      Buffer.from('\nendstream\nstream\n', 'latin1'),
      chunk,
      Buffer.from('\nendstream\nstream\n', 'latin1'),
      later,
      Buffer.from('\nendstream\n%%EOF', 'latin1'),
    ]);

    expect(extractPdfText(pdf)).toBe('seed');
  });

  it('refuses a Flate stream that inflates past the ingest ceiling', () => {
    // ~64 MB of zeros compresses to a few KB — a quota-compliant PDF bomb.
    const bomb = deflateSync(Buffer.alloc(64 * 1024 * 1024, 0x20));
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.1\nBT (seed) Tj ET\nstream\n', 'latin1'),
      bomb,
      Buffer.from('\nendstream\n%%EOF', 'latin1'),
    ]);

    // The bomb is skipped rather than expanded, so the seeded literal is all
    // that survives — and the call returns instead of exhausting the heap.
    expect(extractPdfText(pdf)).toBe('seed');
  });

  it('caps the extracted text at the ingest ceiling', () => {
    const literal = 'a'.repeat(1_500_000);
    const stream = (body: string) => `stream\n${body}\nendstream\n`;
    const pdf = Buffer.from(
      `%PDF-1.1\n${stream(`(${literal}) Tj`)}${stream(
        `(${literal}) Tj`,
      )}${stream(`(${literal}) Tj`)}%%EOF`,
      'latin1',
    );

    // Three uncompressed streams stay under the inflate limit individually;
    // the running character budget is what stops them adding up.
    expect(extractPdfText(pdf).length).toBeLessThanOrEqual(
      PDF_MAX_EXTRACTED_CHARS,
    );
  });

  it('throws when the PDF has no extractable text', () => {
    expect(() => extractPdfText(Buffer.from('%PDF-1.1\n%%EOF'))).toThrow(
      /no extractable text/i,
    );
  });
});

describe('extractSourceText', () => {
  it('rejects an oversized declared response before acquiring a reader or allocating bytes', async () => {
    const response = new Response('small actual body', {
      headers: { 'content-length': String(KNOWLEDGE_SOURCE_MAX_BYTES + 1) },
    });
    const body = getResponseBody(response);
    const cancel = vi
      .spyOn(body, 'cancel')
      .mockRejectedValue(new Error('secondary cleanup failure'));
    const getReader = vi.spyOn(body, 'getReader');
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl: vi.fn().mockResolvedValue(response),
        referenceUrl,
      }),
    ).rejects.toThrow(sizeError);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(getReader).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, '1'])(
    'stops at the observed byte limit with content-length %s',
    async (length) => {
      const tracked = trackedResponse(
        [
          new Uint8Array(KNOWLEDGE_SOURCE_MAX_BYTES).fill(0x61),
          Uint8Array.of(0x62),
          Uint8Array.of(0x63),
        ],
        length ? { 'content-length': length } : undefined,
      );
      tracked.cancel.mockRejectedValue(new Error('secondary cleanup failure'));

      await expect(
        extractSourceText({
          category: KnowledgeBaseCategory.DOCUMENT,
          fetchImpl: vi.fn().mockResolvedValue(tracked.response),
          referenceUrl,
        }),
      ).rejects.toThrow(sizeError);
      expect(tracked.arrayBuffer).not.toHaveBeenCalled();
      expect(tracked.read).toHaveBeenCalledTimes(2);
      expect(tracked.cancel).toHaveBeenCalledOnce();
      expect(tracked.release).toHaveBeenCalledOnce();
      expect(tracked.stream.locked).toBe(false);
    },
  );

  it('preserves streamed Unicode text, metadata, signed URL and fetch policy', async () => {
    const bytes = new TextEncoder().encode('Useful café 🙂 notes.');
    const tracked = trackedResponse(
      [bytes.slice(0, 12), bytes.slice(12, 15), bytes.slice(15)],
      {
        'content-length': String(bytes.byteLength),
        'content-type': 'text/plain; charset=utf-8',
        etag: '"version-2"',
        'last-modified': 'Mon, 12 Oct 2026 10:00:00 GMT',
      },
    );
    const fetchImpl = vi.fn().mockResolvedValue(tracked.response);

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl,
        referenceUrl,
      }),
    ).resolves.toEqual({
      etag: '"version-2"',
      lastModified: 'Mon, 12 Oct 2026 10:00:00 GMT',
      mimeType: 'text/plain',
      text: 'Useful café 🙂 notes.',
    });
    expect(tracked.arrayBuffer).not.toHaveBeenCalled();
    expect(tracked.cancel).not.toHaveBeenCalled();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(referenceUrl, {
      headers: expect.objectContaining({
        Accept: expect.stringContaining('text/plain'),
      }),
      redirect: 'manual',
    });
  });

  it('allows exactly the byte limit and releases the completed reader', async () => {
    const tracked = trackedResponse(
      [new Uint8Array(KNOWLEDGE_SOURCE_MAX_BYTES).fill(0x61)],
      { 'content-type': 'text/plain' },
    );

    const result = await extractSourceText({
      category: KnowledgeBaseCategory.DOCUMENT,
      fetchImpl: vi.fn().mockResolvedValue(tracked.response),
      referenceUrl,
    });
    expect(result.text).toHaveLength(KNOWLEDGE_SOURCE_MAX_BYTES);
    expect(tracked.arrayBuffer).not.toHaveBeenCalled();
    expect(tracked.cancel).not.toHaveBeenCalled();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
  });

  it('preserves the transfer error and releases the reader when cancellation fails', async () => {
    const original = new Error('source transfer disconnected');
    const tracked = trackedResponse([], undefined, original);
    tracked.cancel.mockRejectedValue(new Error('secondary cleanup failure'));

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl: vi.fn().mockResolvedValue(tracked.response),
        referenceUrl,
      }),
    ).rejects.toBe(original);
    expect(tracked.arrayBuffer).not.toHaveBeenCalled();
    expect(tracked.cancel).toHaveBeenCalledOnce();
    expect(tracked.release).toHaveBeenCalledOnce();
    expect(tracked.stream.locked).toBe(false);
  });

  it('does not wait for stuck cancellation after an overflow', async () => {
    const tracked = trackedResponse([
      new Uint8Array(KNOWLEDGE_SOURCE_MAX_BYTES + 1),
    ]);
    tracked.cancel.mockReturnValue(new Promise(() => {}));
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        extractSourceText({
          category: KnowledgeBaseCategory.DOCUMENT,
          fetchImpl: vi.fn().mockResolvedValue(tracked.response),
          referenceUrl,
        }).then(
          () => 'unexpected success',
          (error: unknown) =>
            error instanceof Error ? error.message : 'unexpected error',
        ),
        new Promise<string>((resolve) => {
          deadline = setTimeout(() => resolve('blocked by cleanup'), 100);
        }),
      ]);
      expect(outcome).toBe(sizeError);
      expect(tracked.release).toHaveBeenCalledOnce();
      expect(tracked.stream.locked).toBe(false);
    } finally {
      clearTimeout(deadline);
    }
  });

  it('cancels an unread HTTP failure without masking the status or waiting for cleanup', async () => {
    const response = new Response('unavailable', { status: 503 });
    const cancel = vi
      .spyOn(getResponseBody(response), 'cancel')
      .mockReturnValue(new Promise(() => {}));
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl: vi.fn().mockResolvedValue(response),
        referenceUrl,
      }),
    ).rejects.toThrow('Failed to fetch source (503)');
    expect(cancel).toHaveBeenCalledOnce();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'preserves conditional 304 handling (conditional: %s)',
    async (conditional) => {
      const body = new ReadableStream<Uint8Array>();
      const cancel = vi
        .spyOn(body, 'cancel')
        .mockRejectedValue(new Error('cleanup failed'));
      const arrayBuffer = vi.fn();
      const fetchImpl = vi.fn().mockResolvedValue({
        arrayBuffer,
        body,
        headers: new Headers(),
        ok: false,
        status: 304,
      });
      const result = extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        conditional: conditional
          ? { etag: '"version-1"', lastModified: 'yesterday' }
          : undefined,
        fetchImpl,
        referenceUrl,
      });
      if (conditional) {
        await expect(result).resolves.toEqual({
          mimeType: 'text/plain',
          notModified: true,
          text: '',
        });
        expect(fetchImpl).toHaveBeenCalledWith(referenceUrl, {
          headers: expect.objectContaining({
            'If-None-Match': '"version-1"',
            'If-Modified-Since': 'yesterday',
          }),
          redirect: 'manual',
        });
      } else {
        await expect(result).rejects.toThrow(
          'Unsolicited not-modified response',
        );
      }
      expect(cancel).toHaveBeenCalledOnce();
      expect(arrayBuffer).not.toHaveBeenCalled();
    },
  );

  it('keeps the size limit for legacy fetch adapters without a stream', async () => {
    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl: vi.fn().mockResolvedValue({
          arrayBuffer: async () =>
            new ArrayBuffer(KNOWLEDGE_SOURCE_MAX_BYTES + 1),
          headers: new Headers(),
          ok: true,
          status: 200,
        }),
        referenceUrl,
      }),
    ).rejects.toThrow(sizeError);
  });

  it('uses captured source text without fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(
      extractSourceText({
        capturedText: 'Already captured content',
        category: KnowledgeBaseCategory.DOCUMENT,
        fetchImpl,
        referenceUrl,
      }),
    ).resolves.toEqual({
      mimeType: 'text/plain',
      text: 'Already captured content',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches a URL through the destination guard and extracts HTML', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      arrayBuffer: async () =>
        new TextEncoder().encode('<html><body><p>Public docs</p></body></html>')
          .buffer,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      ok: true,
      status: 200,
    });

    const result = await extractSourceText({
      category: KnowledgeBaseCategory.URL,
      fetchImpl,
      referenceUrl: 'https://docs.example.com/voice',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://docs.example.com/voice',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining('text/html'),
        }),
      }),
    );
    expect(result.mimeType).toContain('text/html');
    expect(result.text).toBe('Public docs');
  });

  it('extracts a plain-text document', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      arrayBuffer: async () =>
        new TextEncoder().encode('Product facts live here.').buffer,
      headers: new Headers({ 'content-type': 'text/plain' }),
      ok: true,
      status: 200,
    });

    const result = await extractSourceText({
      category: KnowledgeBaseCategory.DOCUMENT,
      fetchImpl,
      referenceUrl: 'https://cdn.example.com/guide.txt',
    });

    expect(result.text).toBe('Product facts live here.');
    expect(result.mimeType).toBe('text/plain');
  });

  it('rejects unsupported source categories without fetching', async () => {
    const fetchImpl = vi.fn();

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.FILE,
        fetchImpl,
        referenceUrl: 'https://cdn.example.com/clip.mp4',
      }),
    ).rejects.toBeInstanceOf(UnsupportedKnowledgeSourceError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces destination-guard failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DestinationGuardError('private address'));

    await expect(
      extractSourceText({
        category: KnowledgeBaseCategory.URL,
        fetchImpl,
        referenceUrl: 'http://127.0.0.1/admin',
      }),
    ).rejects.toBeInstanceOf(DestinationGuardError);
  });
});

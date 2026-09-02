import {
  extractHtmlText,
  extractPdfText,
  extractSourceText,
  UnsupportedKnowledgeSourceError,
} from '@api/collections/contexts/utils/extract-source-text.util';
import { KnowledgeBaseCategory } from '@genfeedai/enums';
import { DestinationGuardError } from '@libs/security/destination-guard';

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

  it('throws when the PDF has no extractable text', () => {
    expect(() => extractPdfText(Buffer.from('%PDF-1.1\n%%EOF'))).toThrow(
      /no extractable text/i,
    );
  });
});

describe('extractSourceText', () => {
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
        category: KnowledgeBaseCategory.VIDEO,
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSitemapUniverse } from './crawl';

const ORIGIN = 'http://localhost:3000';
const USER_AGENT = 'genfeed-seo-audit/1.0 (+https://genfeed.ai)';
const TIMEOUT_MS = 25;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://genfeed.ai/</loc></url>
  <url><loc>https://genfeed.ai/pricing/</loc></url>
</urlset>`;

interface FetchInit {
  readonly headers: Record<string, string>;
  readonly signal: AbortSignal;
}

/** Minimal stand-in for the parts of Response fetchSitemapUniverse reads. */
function sitemapResponse(xml: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(xml),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchSitemapUniverse', () => {
  it('reads every <loc> and the origin the sitemap advertises', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(sitemapResponse(SITEMAP_XML)),
    );
    vi.stubGlobal('fetch', fetchMock);

    const universe = await fetchSitemapUniverse({
      origin: ORIGIN,
      timeoutMs: TIMEOUT_MS,
      userAgent: USER_AGENT,
    });

    expect([...universe.paths]).toEqual(['/', '/pricing']);
    expect(universe.publicOrigin).toBe('https://genfeed.ai');
  });

  it('bounds the request with the crawl timeout', async () => {
    // Regression guard: the sitemap fetch shipped without a timeout. Both
    // consumers await it before any other work, so a server that accepts the
    // connection and never answers stalled the run until CI killed the job.
    const fetchMock = vi.fn((_url: string, init: FetchInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted.'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchSitemapUniverse({
        origin: ORIGIN,
        timeoutMs: TIMEOUT_MS,
        userAgent: USER_AGENT,
      }),
    ).rejects.toThrow('The operation was aborted.');
  });

  it('clears the timer once the sitemap resolves', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(sitemapResponse(SITEMAP_XML))),
    );

    await fetchSitemapUniverse({
      origin: ORIGIN,
      timeoutMs: TIMEOUT_MS,
      userAgent: USER_AGENT,
    });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('clears the timer when the sitemap answers with an error status', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(sitemapResponse('', 500))),
    );

    await expect(
      fetchSitemapUniverse({
        origin: ORIGIN,
        timeoutMs: TIMEOUT_MS,
        userAgent: USER_AGENT,
      }),
    ).rejects.toThrow('Could not load /sitemap.xml (HTTP 500)');
    expect(clearSpy).toHaveBeenCalled();
  });
});

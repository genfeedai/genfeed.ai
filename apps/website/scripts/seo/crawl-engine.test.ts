import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_EXTENSIONS,
  type CrawlOptions,
  crawlSite,
  extractHrefs,
  fetchPath,
  locToPath,
  stripTrailingSlash,
  toInternalPath,
} from './crawl';

const ORIGIN = 'http://localhost:3000';
const USER_AGENT = 'genfeed-seo-audit/1.0 (+https://genfeed.ai)';

interface StubPage {
  readonly status?: number;
  readonly contentType?: string;
  readonly location?: string;
  readonly body?: string;
}

interface StubResponse {
  readonly status: number;
  readonly headers: { get: (name: string) => string | null };
  readonly text: () => Promise<string>;
}

/**
 * Minimal `fetch` stand-in serving a fixed path → page map. Unknown paths
 * answer 404 so a crawl walking off the fixture is visible in the assertions
 * rather than silently succeeding.
 */
function stubFetch(pages: Record<string, StubPage>): ReturnType<typeof vi.fn> {
  return vi.fn((url: string): Promise<StubResponse> => {
    const { pathname } = new URL(url);
    const page = pages[pathname];
    if (!page) {
      return Promise.resolve(makeResponse({ status: 404 }));
    }
    return Promise.resolve(makeResponse(page));
  });
}

function makeResponse(page: StubPage): StubResponse {
  const contentType =
    page.contentType ?? (page.body === undefined ? '' : 'text/html');
  const headers = new Map<string, string>();
  headers.set('content-type', contentType);
  if (page.location) {
    headers.set('location', page.location);
  }
  return {
    headers: { get: (name: string) => headers.get(name) ?? null },
    status: page.status ?? 200,
    text: () => Promise.resolve(page.body ?? ''),
  };
}

function crawlOptions(overrides: Partial<CrawlOptions> = {}): CrawlOptions {
  return {
    concurrency: 2,
    origin: ORIGIN,
    timeoutMs: 1_000,
    userAgent: USER_AGENT,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ASSET_EXTENSIONS', () => {
  it('matches asset paths and leaves page paths alone', () => {
    expect(ASSET_EXTENSIONS.test('/logo.png')).toBe(true);
    expect(ASSET_EXTENSIONS.test('/bundle.mjs')).toBe(true);
    expect(ASSET_EXTENSIONS.test('/font.woff2')).toBe(true);
    expect(ASSET_EXTENSIONS.test('/pricing')).toBe(false);
  });
});

describe('stripTrailingSlash', () => {
  it('keeps the site root intact', () => {
    expect(stripTrailingSlash('/')).toBe('/');
  });

  it('drops a trailing slash from a nested path', () => {
    expect(stripTrailingSlash('/pricing/')).toBe('/pricing');
  });

  it('leaves a path without a trailing slash unchanged', () => {
    expect(stripTrailingSlash('/pricing')).toBe('/pricing');
  });
});

describe('locToPath', () => {
  it('reduces an absolute <loc> to its pathname', () => {
    expect(locToPath('https://genfeed.ai/pricing/')).toBe('/pricing');
  });

  it('trims surrounding whitespace', () => {
    expect(locToPath('  https://genfeed.ai/faq  ')).toBe('/faq');
  });

  it('falls back to the raw value when the <loc> is not a URL', () => {
    expect(locToPath('/relative/')).toBe('/relative');
  });
});

describe('toInternalPath', () => {
  it.each([
    ['empty href', ''],
    ['whitespace-only href', '   '],
    ['fragment', '#section'],
    ['mailto', 'mailto:hi@genfeed.ai'],
    ['tel', 'tel:+15551234'],
    ['javascript', 'javascript:void(0)'],
  ])('returns null for a %s', (_label, href) => {
    expect(toInternalPath(href, '/', ORIGIN)).toBeNull();
  });

  it('returns null for an unparseable href', () => {
    expect(toInternalPath('http://[', '/', ORIGIN)).toBeNull();
  });

  it('returns null for a cross-origin link', () => {
    expect(toInternalPath('https://example.com/x', '/', ORIGIN)).toBeNull();
  });

  it('returns null for an asset link', () => {
    expect(toInternalPath('/static/logo.svg', '/', ORIGIN)).toBeNull();
  });

  it('resolves a relative href against the source page', () => {
    expect(toInternalPath('./b', '/a/c', ORIGIN)).toBe('/a/b');
  });

  it('strips query and hash and the trailing slash', () => {
    expect(toInternalPath('/pricing/?utm=x#top', '/', ORIGIN)).toBe('/pricing');
  });

  it('accepts an absolute same-origin URL', () => {
    expect(toInternalPath(`${ORIGIN}/faq`, '/', ORIGIN)).toBe('/faq');
  });
});

describe('extractHrefs', () => {
  it('reads double- and single-quoted href values in document order', () => {
    const html = `<a href="/a">a</a><link href='/b'><a  href = "/c">c</a>`;
    expect(extractHrefs(html)).toEqual(['/a', '/b', '/c']);
  });

  it('returns an empty list when the document has no links', () => {
    expect(extractHrefs('<p>no links</p>')).toEqual([]);
  });

  it('keeps an empty href as an empty string', () => {
    expect(extractHrefs('<a href="">x</a>')).toEqual(['']);
  });
});

describe('fetchPath', () => {
  it('reads the body for an HTML response and reports the status', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ '/pricing': { body: '<html></html>' } }),
    );

    const result = await fetchPath('/pricing', {
      origin: ORIGIN,
      timeoutMs: 1_000,
      userAgent: USER_AGENT,
    });

    expect(result).toEqual({
      body: '<html></html>',
      isHtml: true,
      location: null,
      status: 200,
    });
  });

  it('skips the body for a non-HTML response and surfaces the location header', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/old': { contentType: 'text/plain', location: '/new', status: 308 },
      }),
    );

    const result = await fetchPath('/old', {
      origin: ORIGIN,
      timeoutMs: 1_000,
      userAgent: USER_AGENT,
    });

    expect(result).toEqual({
      body: null,
      isHtml: false,
      location: '/new',
      status: 308,
    });
  });

  it('sends the configured user agent and disables automatic redirects', async () => {
    const fetchMock = stubFetch({ '/': { body: '<html></html>' } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchPath('/', {
      origin: ORIGIN,
      timeoutMs: 1_000,
      userAgent: USER_AGENT,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${ORIGIN}/`,
      expect.objectContaining({
        headers: { 'user-agent': USER_AGENT },
        redirect: 'manual',
      }),
    );
  });

  it('clears the timeout even when the request rejects', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    await expect(
      fetchPath('/', { origin: ORIGIN, timeoutMs: 5, userAgent: USER_AGENT }),
    ).rejects.toThrow('ECONNREFUSED');
    expect(clearSpy).toHaveBeenCalled();
  });

  it('aborts the request once the timeout elapses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new Error('The operation was aborted.'));
            });
          }),
      ),
    );

    await expect(
      fetchPath('/', { origin: ORIGIN, timeoutMs: 1, userAgent: USER_AGENT }),
    ).rejects.toThrow('The operation was aborted.');
  });
});

describe('crawlSite', () => {
  it('walks internal links breadth-first and records outgoing links per page', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/': { body: '<a href="/a">a</a><a href="https://x.dev">out</a>' },
        '/a': { body: '<a href="/b">b</a><a href="/">home</a>' },
        '/b': { body: '<p>leaf</p>' },
      }),
    );

    const result = await crawlSite(crawlOptions());

    expect([...result.reachable].sort()).toEqual(['/', '/a', '/b']);
    expect(result.linksFrom.get('/')).toEqual(['/a']);
    expect(result.linksFrom.get('/a')).toEqual(['/b', '/']);
    expect(result.broken).toEqual([]);
    expect(result.redirects).toEqual([]);
    expect(result.pages.get('/b')).toEqual({
      html: '<p>leaf</p>',
      isHtml: true,
      path: '/b',
      source: '/a',
      status: 200,
    });
  });

  it('starts from the supplied seeds instead of the site root', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ '/docs': { body: '<p>docs</p>' }, '/faq': { body: 'faq' } }),
    );

    const result = await crawlSite(crawlOptions({ seeds: ['/docs', '/faq'] }));

    expect([...result.reachable].sort()).toEqual(['/docs', '/faq']);
    expect(result.pages.get('/docs')?.source).toBe('seed');
  });

  it('records a 4xx as broken and attributes it to the discovering page', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ '/': { body: '<a href="/gone">gone</a>' } }),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.broken).toEqual([
      { path: '/gone', source: '/', status: 404 },
    ]);
    expect(result.reachable.has('/gone')).toBe(false);
  });

  it('records a network failure as a zero-status break', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.broken).toEqual([{ path: '/', source: 'seed', status: 0 }]);
  });

  it('records a redirect and keeps crawling through its target', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/': { body: '<a href="/old">old</a>' },
        '/old': { location: '/new', status: 301 },
        '/new': { body: '<p>new</p>' },
      }),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.redirects).toEqual([
      { location: '/new', path: '/old', source: '/', status: 301 },
    ]);
    expect(result.reachable.has('/new')).toBe(true);
    expect(result.pages.get('/new')?.source).toBe('/');
  });

  it('reports "(none)" when a redirect omits its location header', async () => {
    vi.stubGlobal('fetch', stubFetch({ '/': { status: 302 } }));

    const result = await crawlSite(crawlOptions());

    expect(result.redirects).toEqual([
      { location: '(none)', path: '/', source: 'seed', status: 302 },
    ]);
    expect(result.reachable.size).toBe(0);
  });

  it('does not follow a redirect that points off-origin', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ '/': { location: 'https://elsewhere.dev/', status: 307 } }),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.redirects).toHaveLength(1);
    expect(result.pages.size).toBe(0);
  });

  it('crawls suppressed paths without reporting them as broken or redirecting', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/': { body: '<a href="/skip">skip</a><a href="/moved">moved</a>' },
        '/moved': { location: '/', status: 301 },
      }),
    );

    const result = await crawlSite(
      crawlOptions({
        isSuppressed: (path) => path === '/skip' || path === '/moved',
      }),
    );

    expect(result.broken).toEqual([]);
    expect(result.redirects).toEqual([]);
  });

  it('records a reachable non-HTML page without collecting links from it', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        '/': { body: '<a href="/feed">feed</a>' },
        '/feed': { contentType: 'application/rss+xml' },
      }),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.pages.get('/feed')?.isHtml).toBe(false);
    expect(result.linksFrom.has('/feed')).toBe(false);
  });

  it('visits each path once even when many pages link to it', async () => {
    const fetchMock = stubFetch({
      '/': { body: '<a href="/a">a</a><a href="/b">b</a>' },
      '/a': { body: '<a href="/shared">s</a>' },
      '/b': { body: '<a href="/shared">s</a>' },
      '/shared': { body: '<p>shared</p>' },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await crawlSite(crawlOptions({ concurrency: 1 }));

    const sharedCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === `${ORIGIN}/shared`,
    );
    expect(sharedCalls).toHaveLength(1);
    expect(result.pages.get('/shared')?.source).toBe('/a');
  });

  it('treats a malformed response as a zero-status break rather than crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          get headers(): never {
            throw new Error('boom');
          },
          status: 200,
          text: () => Promise.resolve(''),
        }),
      ),
    );

    const result = await crawlSite(crawlOptions());

    expect(result.broken).toEqual([{ path: '/', source: 'seed', status: 0 }]);
  });
});

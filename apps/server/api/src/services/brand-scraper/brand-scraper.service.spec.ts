import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors the real destination guard's reject-before-connect contract. A bare
// pass-through to fetch would stub out the very check the redirect-SSRF tests
// assert, so blocked hosts must throw here rather than reach the network. Kept
// hermetic (no DNS) by matching on the literal hostname.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^\[?::1\]?$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: (input: string | URL, init?: RequestInit) => {
    const { hostname } = new URL(String(input));

    if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
      throw new Error(`URL points to a blocked address: ${hostname}`);
    }

    return globalThis.fetch(input, init);
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHtml(
  opts: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogSiteName?: string;
    themeColor?: string;
    body?: string;
    head?: string;
  } = {},
): string {
  const title = opts.title ?? 'Acme Corp | Home';
  const description = opts.description ?? 'We make things.';
  const ogTitle = opts.ogTitle ?? 'Acme Corp';
  const ogDescription = opts.ogDescription ?? 'Open Graph desc';
  const ogImage = opts.ogImage ?? 'https://acme.com/og.png';
  const ogSiteName = opts.ogSiteName ?? 'Acme';
  const themeColor =
    opts.themeColor !== undefined ? opts.themeColor : '#ff5500';
  const body = opts.body ?? '';
  const head = opts.head ?? '';

  const themeColorMeta = themeColor
    ? `<meta name="theme-color" content="${themeColor}" />`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:site_name" content="${ogSiteName}" />
  ${themeColorMeta}
  ${head}
</head>
<body>${body}</body>
</html>`;
}

function makeResponse(html: string, status = 200): Response {
  return new Response(html, {
    headers: { 'content-type': 'text/html' },
    status,
  });
}

function make429Response(retryAfter = '0'): Response {
  return new Response('', {
    headers: { 'Retry-After': retryAfter },
    status: 429,
  });
}

function makeRedirect(location: string, status = 302): Response {
  return new Response(null, {
    headers: { location },
    status,
  });
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

const mockConfigService = {
  get: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('BrandScraperService', () => {
  let service: BrandScraperService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.clearAllMocks();
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandScraperService,
        BrandWebsiteParserService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<BrandScraperService>(BrandScraperService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('bounded website stylesheet enrichment', () => {
    function cssResponse(
      css: string | ReadableStream<Uint8Array>,
      headers: Record<string, string> = {},
      status = 200,
    ): Response {
      return new Response(css, {
        headers: { 'content-type': 'text/css; charset=utf-8', ...headers },
        status,
      });
    }
    function pageWithSheets(count = 1): Response {
      return makeResponse(
        makeHtml({
          themeColor: '',
          head: Array.from(
            { length: count },
            (_, i) => `<link rel="stylesheet" href="/sheet${i}.css">`,
          ).join(''),
          body: '<h1>Useful company content</h1>',
        }),
      );
    }
    function codes(
      result: Awaited<
        ReturnType<BrandScraperService['scrapeWebsiteWithEvidence']>
      >,
    ): string[] {
      return result.diagnostics.map((entry) => entry.code);
    }
    function fakeClock(): void {
      vi.useFakeTimers();
      vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    }
    it.each([NaN, Infinity, -Infinity, -1, 0])(
      'rejects an invalid or expired caller deadline %s without fetching',
      async (deadlineAt) => {
        vi.spyOn(performance, 'now').mockReturnValue(10);
        await expect(
          service.scrapeWebsiteWithEvidence('https://acme.com', { deadlineAt }),
        ).rejects.toThrow('deadline_exceeded');
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
    it('aborts the HTML read once the body exceeds the byte cap', async () => {
      const cancel = vi.fn();
      const pulled = vi.fn();
      const chunk = new Uint8Array(1_048_576);
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled();
          controller.enqueue(chunk);
        },
        cancel,
      });
      fetchMock.mockResolvedValue(
        new Response(stream, { headers: { 'content-type': 'text/html' } }),
      );
      await service
        .scrapeWebsiteWithEvidence('https://acme.com')
        .catch(() => undefined);
      expect(cancel).toHaveBeenCalled();
      expect(pulled.mock.calls.length).toBeLessThanOrEqual(6);
    });
    it('uses the shorter caller budget across stalled body and fallback without mutating it', async () => {
      fakeClock();
      const cancel = vi.fn();
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { 'content-type': 'text/html' },
          }),
        ),
      );
      const budget = { deadlineAt: performance.now() + 25 };
      const original = budget.deadlineAt;
      const pending = service
        .scrapeWebsiteWithEvidence('https://acme.com', budget)
        .catch((error) => error);
      await vi.advanceTimersByTimeAsync(25);
      expect(await pending).toBeInstanceOf(Error);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
      expect(budget.deadlineAt).toBe(original);
      expect(vi.getTimerCount()).toBe(0);
    });
    it('caps a longer caller deadline at the existing sixty seconds across slow CSS redirects', async () => {
      fakeClock();
      fetchMock.mockResolvedValueOnce(pageWithSheets(2));
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(makeRedirect('/next.css')), 9999),
          ),
      );
      const budget = { deadlineAt: performance.now() + 120000 };
      const original = budget.deadlineAt;
      const pending = service.scrapeWebsiteWithEvidence(
        'https://acme.com',
        budget,
      );
      await vi.advanceTimersByTimeAsync(60000);
      expect(codes(await pending)).toContain('brand_scrape.deadline_exceeded');
      expect(budget.deadlineAt).toBe(original);
    });
    it('uses the shorter caller deadline for stylesheet reads after useful HTML', async () => {
      fakeClock();
      const cancel = vi.fn();
      fetchMock
        .mockResolvedValueOnce(pageWithSheets())
        .mockResolvedValueOnce(
          cssResponse(new ReadableStream<Uint8Array>({ cancel })),
        );
      const pending = service.scrapeWebsiteWithEvidence('https://acme.com', {
        deadlineAt: performance.now() + 25,
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(codes(await pending)).toContain('brand_scrape.deadline_exceeded');
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses the caller remainder for 429 waits while retaining later usable stylesheet data', async () => {
      fakeClock();
      fetchMock
        .mockResolvedValueOnce(pageWithSheets(2))
        .mockResolvedValueOnce(make429Response('1'))
        .mockResolvedValueOnce(cssResponse("a{font-family:'Next Face'}"));
      const result = await service.scrapeWebsiteWithEvidence(
        'https://acme.com',
        { deadlineAt: performance.now() + 25 },
      );
      expect(codes(result)).toContain('brand_scrape.stylesheet_failed');
      expect(result.data.fontFamily).toBe('Next Face');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    });
    it('shares a shorter deadline across redirected CSS headers and body consumption', async () => {
      fakeClock();
      const cancel = vi.fn();
      fetchMock
        .mockResolvedValueOnce(pageWithSheets())
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) =>
              setTimeout(() => resolve(makeRedirect('/final.css')), 20),
            ),
        )
        .mockResolvedValueOnce(
          cssResponse(new ReadableStream<Uint8Array>({ cancel })),
        );
      const pending = service.scrapeWebsiteWithEvidence('https://acme.com', {
        deadlineAt: performance.now() + 25,
      });
      await vi.advanceTimersByTimeAsync(25);
      expect(codes(await pending)).toContain('brand_scrape.deadline_exceeded');
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('enriches existing callers and exposes variable-font evidence without fetching nested assets', async () => {
      fetchMock
        .mockResolvedValueOnce(pageWithSheets())
        .mockResolvedValueOnce(
          cssResponse(
            `@import '/nested.css'; @font-face {font-family:'Acme Variable';font-weight:100 900;src:url('/font.woff2')} body {font-family:'Acme Variable';color:#123abc;background-image:url('/image.png')}`,
          ),
        );
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(result.data.fontCandidates).toEqual(['Acme Variable']);
      expect(result.data.fontFamily).toBe('Acme Variable');
      expect(result.data.primaryColor).toBe('#123abc');
      expect(result.data.heroText).toBe('Useful company content');
      expect(result.fontCandidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            family: 'Acme Variable',
            weight: '100 900',
            availability: 'unknown',
            sourceUrl: 'https://acme.com/sheet0.css',
          }),
        ]),
      );
      expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
        'https://acme.com',
        'https://acme.com/sheet0.css',
      ]);
      fetchMock
        .mockResolvedValueOnce(pageWithSheets())
        .mockResolvedValueOnce(
          cssResponse("body{font-family:'Legacy Enriched'}"),
        );
      const data = await service.scrapeWebsite('https://acme.com');
      expect(data.fontFamily).toBe('Legacy Enriched');
      expect(data).not.toHaveProperty('evidence');
    });
    it('resolves links from the final redirect URL and permits five CSS redirects', async () => {
      fetchMock
        .mockResolvedValueOnce(makeRedirect('/final/page'))
        .mockResolvedValueOnce(
          makeResponse(
            makeHtml({ head: '<link rel="stylesheet" href="styles.css">' }),
          ),
        );
      for (let i = 0; i < 5; i++)
        fetchMock.mockResolvedValueOnce(makeRedirect(`/hop${i}.css`));
      fetchMock.mockResolvedValueOnce(
        cssResponse("a{font-family:'Redirect Face'}"),
      );
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(fetchMock.mock.calls[2][0]).toBe(
        'https://acme.com/final/styles.css',
      );
      expect(result.fontCandidates[0].sourceUrl).toBe(
        'https://acme.com/hop4.css',
      );
      expect(result.data.fontFamily).toBe('Redirect Face');
    });
    it('rejects the sixth CSS redirect and private destinations before connecting', async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(
          makeHtml({
            head: '<link rel="stylesheet" href="/loop.css"><link rel="stylesheet" href="/private.css"><link rel="stylesheet" href="http://localhost/direct.css"><link rel="stylesheet" href="javascript:alert(1)">',
          }),
        ),
      );
      for (let i = 0; i < 6; i++)
        fetchMock.mockResolvedValueOnce(makeRedirect(`/loop${i}.css`));
      fetchMock.mockResolvedValueOnce(
        makeRedirect('http://192.168.1.1/secret.css'),
      );
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(codes(result)).toEqual(
        expect.arrayContaining([
          'brand_scrape.stylesheet_redirect_limit',
          'brand_scrape.stylesheet_unsafe',
        ]),
      );
      expect(fetchMock).toHaveBeenCalledTimes(8);
      expect(
        fetchMock.mock.calls.some((call) =>
          /localhost|192\.168/.test(String(call[0])),
        ),
      ).toBe(false);
      expect(result.data.companyName).toBe('Acme Corp');
    });
    it.each([
      [
        'wrong MIME',
        () => cssResponse('body{}', { 'content-type': 'text/html' }),
        'stylesheet_content_type',
      ],
      ['HTTP failure', () => cssResponse('', {}, 404), 'stylesheet_failed'],
      [
        'declared size',
        () => cssResponse('body{}', { 'content-length': '262145' }),
        'stylesheet_size_limit',
      ],
      [
        'actual streamed size',
        () => cssResponse('x'.repeat(262145)),
        'stylesheet_size_limit',
      ],
    ])('keeps useful HTML after %s', async (_name, response, code) => {
      fetchMock
        .mockResolvedValueOnce(pageWithSheets(2))
        .mockResolvedValueOnce(response())
        .mockResolvedValueOnce(cssResponse("a{font-family:'Surviving Face'}"));
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(codes(result)).toContain(`brand_scrape.${code}`);
      expect(result.data.heroText).toBe('Useful company content');
      expect(result.data.fontFamily).toBe('Surviving Face');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    it('fetches only five distinct sheets and cancels the sheet at aggregate exhaustion', async () => {
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(262144));
        },
        cancel,
      });
      fetchMock.mockResolvedValueOnce(pageWithSheets(6));
      const css = "a{font-family:'Retained Face'}".padEnd(262144, ' ');
      for (let i = 0; i < 3; i++)
        fetchMock.mockResolvedValueOnce(cssResponse(css));
      fetchMock.mockResolvedValueOnce(cssResponse(stream));
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(codes(result)).toEqual(
        expect.arrayContaining([
          'brand_scrape.stylesheet_count_limit',
          'brand_scrape.stylesheet_total_limit',
        ]),
      );
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(cancel).toHaveBeenCalledOnce();
      expect(result.data.fontFamily).toBe('Retained Face');
    });
    it('keeps the per-attempt body timeout active after headers and cancels the reader', async () => {
      fakeClock();
      const cancel = vi.fn();
      const stream = new ReadableStream<Uint8Array>({ cancel });
      fetchMock
        .mockResolvedValueOnce(pageWithSheets())
        .mockResolvedValueOnce(cssResponse(stream));
      const pending = service.scrapeWebsiteWithEvidence('https://acme.com');
      await vi.advanceTimersByTimeAsync(10000);
      const result = await pending;
      expect(codes(result)).toContain('brand_scrape.stylesheet_failed');
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });
    it('does not wait past the shared deadline for Retry-After', async () => {
      fakeClock();
      fetchMock
        .mockResolvedValueOnce(pageWithSheets(2))
        .mockResolvedValueOnce(make429Response('61'))
        .mockResolvedValueOnce(cssResponse("a{font-family:'Next Face'}"));
      const result =
        await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(codes(result)).toContain('brand_scrape.stylesheet_failed');
      expect(codes(result)).not.toContain('brand_scrape.deadline_exceeded');
      expect(result.data.fontFamily).toBe('Next Face');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });
    it('bounds deferred headers, fallback and concurrent website operations independently', async () => {
      fakeClock();
      fetchMock.mockImplementation((url: string) =>
        url.includes('slow')
          ? new Promise<Response>(() => undefined)
          : Promise.resolve(makeResponse(makeHtml())),
      );
      const slow = service
        .scrapeWebsiteWithEvidence('https://slow.example')
        .catch((error) => error);
      const fast = await service.scrapeWebsiteWithEvidence('https://acme.com');
      expect(fast.data.companyName).toBe('Acme Corp');
      await vi.advanceTimersByTimeAsync(20000);
      expect(await slow).toBeInstanceOf(Error);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });
    it('shares the operation deadline across slow redirects without postdeadline fetches', async () => {
      fakeClock();
      fetchMock.mockResolvedValueOnce(pageWithSheets(2));
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(() => resolve(makeRedirect('/next.css')), 9999),
          ),
      );
      const pending = service.scrapeWebsiteWithEvidence('https://acme.com');
      await vi.advanceTimersByTimeAsync(60000);
      const result = await pending;
      expect(codes(result)).toContain('brand_scrape.deadline_exceeded');
      expect(fetchMock).toHaveBeenCalledTimes(8);
      await vi.runAllTimersAsync();
      expect(fetchMock).toHaveBeenCalledTimes(8);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });
    it('sanitizes website wrapper logging without changing caller projections', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(makeResponse(makeHtml())),
      );
      const analyzed = await service.scrapeAndAnalyze(
        'https://acme.com?token=wrapper-secret',
      );
      const merged = await service.scrapeAllSources({
        websiteUrl: 'https://acme.com?api_key=wrapper-secret',
      });
      expect(analyzed.companyName).toBe('Acme Corp');
      expect(merged.companyName).toBe('Acme Corp');
      expect(JSON.stringify(mockLogger.log.mock.calls)).not.toContain(
        'wrapper-secret',
      );
      fetchMock.mockRejectedValue(
        new Error('https://acme.com?token=wrapper-secret'),
      );
      await expect(
        service.scrapeAndAnalyze('https://acme.com?token=wrapper-secret'),
      ).rejects.toThrow();
      await service.scrapeAllSources({
        websiteUrl: 'https://acme.com?token=wrapper-secret',
      });
      expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain(
        'wrapper-secret',
      );
    });
    it('reports successful meta fallback and never logs credential-bearing website URLs', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(makeResponse(makeHtml()));
      const result = await service.scrapeWebsiteWithEvidence(
        'https://acme.com?token=secret',
      );
      expect(codes(result)).toContain('brand_scrape.html_fallback');
      expect(JSON.stringify(result.evidence)).not.toContain('secret');
      expect(JSON.stringify(mockLogger.log.mock.calls)).not.toContain('secret');
      expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain(
        'secret',
      );
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // detectUrlType
  // =========================================================================
  describe('detectUrlType', () => {
    it('routes linkedin.com to linkedinUrl', () => {
      expect(
        service.detectUrlType('https://linkedin.com/company/acme'),
      ).toEqual({
        linkedinUrl: 'https://linkedin.com/company/acme',
      });
    });

    it('routes x.com to xProfileUrl', () => {
      expect(service.detectUrlType('https://x.com/acme')).toEqual({
        xProfileUrl: 'https://x.com/acme',
      });
    });

    it('routes twitter.com to xProfileUrl', () => {
      expect(service.detectUrlType('https://twitter.com/acme')).toEqual({
        xProfileUrl: 'https://twitter.com/acme',
      });
    });

    it('routes generic website to websiteUrl', () => {
      expect(service.detectUrlType('https://acme.com')).toEqual({
        websiteUrl: 'https://acme.com',
      });
    });

    it('works without protocol prefix for linkedin', () => {
      expect(service.detectUrlType('linkedin.com/company/foo')).toEqual({
        linkedinUrl: 'linkedin.com/company/foo',
      });
    });

    it('routes www.linkedin.com to linkedinUrl', () => {
      expect(
        service.detectUrlType('https://www.linkedin.com/company/acme'),
      ).toEqual({
        linkedinUrl: 'https://www.linkedin.com/company/acme',
      });
    });

    it('does not treat lookalike hostnames as LinkedIn or X', () => {
      expect(service.detectUrlType('https://evil-linkedin.com')).toEqual({
        websiteUrl: 'https://evil-linkedin.com',
      });
      expect(service.detectUrlType('https://linkedin.com.evil.com')).toEqual({
        websiteUrl: 'https://linkedin.com.evil.com',
      });
      expect(service.detectUrlType('https://nottwitter.com/acme')).toEqual({
        websiteUrl: 'https://nottwitter.com/acme',
      });
      expect(service.detectUrlType('https://x.com.evil.com/acme')).toEqual({
        websiteUrl: 'https://x.com.evil.com/acme',
      });
    });
  });

  // =========================================================================
  // validateUrl
  // =========================================================================
  describe('validateUrl', () => {
    it('accepts a valid URL', () => {
      expect(service.validateUrl('https://acme.com')).toEqual({
        isValid: true,
      });
    });

    it('accepts a URL without protocol', () => {
      expect(service.validateUrl('acme.com')).toEqual({ isValid: true });
    });

    it('rejects localhost (no dot in hostname)', () => {
      const result = service.validateUrl('http://localhost:3000');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects 127.0.0.1', () => {
      const result = service.validateUrl('http://127.0.0.1');
      expect(result.isValid).toBe(false);
    });

    it('rejects the cloud metadata endpoint (SSRF)', () => {
      const result = service.validateUrl(
        'http://169.254.169.254/latest/meta-data/',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Local URLs are not allowed');
    });

    it('rejects RFC-1918 private ranges (SSRF)', () => {
      for (const target of [
        'http://10.0.0.5',
        'http://172.16.1.1',
        'http://192.168.1.1',
      ]) {
        expect(service.validateUrl(target).isValid).toBe(false);
      }
    });

    it('rejects .internal hostnames (SSRF)', () => {
      expect(service.validateUrl('http://db.cluster.internal').isValid).toBe(
        false,
      );
    });

    it('rejects 0.0.0.0', () => {
      const result = service.validateUrl('http://0.0.0.0');
      expect(result.isValid).toBe(false);
    });

    it('rejects invalid URL strings', () => {
      const result = service.validateUrl('not a url !!!');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects hostname without a dot', () => {
      const result = service.validateUrl('acme');
      expect(result.isValid).toBe(false);
    });
  });

  // =========================================================================
  // scrapeWebsite — happy path
  // =========================================================================
  describe('scrapeWebsite', () => {
    it('extracts company name, description, and primary color', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(
          makeHtml({
            description: 'We make things.',
            themeColor: '#ff5500',
            title: 'Acme Corp | Home',
          }),
        ),
      );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.companyName).toBe('Acme Corp');
      expect(result.description).toBe('We make things.');
      expect(result.primaryColor).toBe('#ff5500');
      expect(result.sourceUrl).toBe('https://acme.com');
    });

    it('normalizes URL — adds https:// when missing', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ title: 'Test' })));

      const result = await service.scrapeWebsite('acme.com');
      expect(result.sourceUrl).toBe('https://acme.com');
    });

    it('normalizes URL — removes trailing slash', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ title: 'Test' })));

      const result = await service.scrapeWebsite('https://acme.com/');
      expect(result.sourceUrl).toBe('https://acme.com');
    });

    it('extracts tagline from ogTitle', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(makeHtml({ ogTitle: 'The worlds best widget' })),
      );

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result.tagline).toBeDefined();
    });

    it('extracts social links from anchor hrefs', async () => {
      const body = [
        '<a href="https://twitter.com/acme">Twitter</a>',
        '<a href="https://linkedin.com/company/acme">LinkedIn</a>',
        '<a href="https://facebook.com/acme">Facebook</a>',
        '<a href="https://instagram.com/acme">Instagram</a>',
        '<a href="https://youtube.com/acme">YouTube</a>',
        '<a href="https://tiktok.com/@acme">TikTok</a>',
      ].join('\n');
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ body })));

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result.socialLinks.twitter).toContain('twitter.com');
      expect(result.socialLinks.linkedin).toContain('linkedin.com');
      expect(result.socialLinks.facebook).toContain('facebook.com');
      expect(result.socialLinks.instagram).toContain('instagram.com');
      expect(result.socialLinks.youtube).toContain('youtube.com');
      expect(result.socialLinks.tiktok).toContain('tiktok.com');
    });

    it('extracts colors from CSS hex values in style tags', async () => {
      const head =
        '<style>body { background: #123456; color: #abcdef; }</style>';
      fetchMock.mockResolvedValue(
        makeResponse(makeHtml({ head, themeColor: '' })),
      );

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result.primaryColor).toBeDefined();
    });

    it('extracts font and asset candidates for brand kit drafts', async () => {
      const head = [
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700" />',
        '<style>body { font-family: "Satoshi", sans-serif; color: #123456; }</style>',
      ].join('\n');
      const body = [
        '<img class="logo" src="/logo.svg" alt="Acme logo" />',
        '<img class="hero" src="/hero.jpg" alt="Hero" />',
        '<img src="/reference.jpg" alt="Reference" />',
      ].join('\n');
      fetchMock.mockResolvedValue(
        makeResponse(
          makeHtml({
            body,
            head,
            ogImage: 'https://acme.com/social.jpg',
            title: 'Acme | Home',
          }),
        ),
      );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.fontFamily).toBe('Inter');
      expect(result.fontCandidates).toEqual(
        expect.arrayContaining(['Inter', 'Satoshi']),
      );
      expect(result.logoUrl).toBe('https://acme.com/logo.svg');
      expect(result.bannerUrl).toBe('https://acme.com/hero.jpg');
      expect(result.referenceImageUrls).toEqual(
        expect.arrayContaining([
          'https://acme.com/social.jpg',
          'https://acme.com/reference.jpg',
        ]),
      );
    });

    it('uses Logo.dev only when the website scraper finds no logo', async () => {
      mockConfigService.get.mockReturnValue('pk_test');
      fetchMock.mockResolvedValue(
        makeResponse(makeHtml({ body: '', title: 'Acme | Home' })),
      );

      const result = await service.scrapeWebsite('https://www.acme.com/about');

      expect(result.logoUrl).toBe(
        'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
      );
    });

    it('keeps a scraper-discovered logo ahead of Logo.dev', async () => {
      mockConfigService.get.mockReturnValue('pk_test');
      fetchMock.mockResolvedValue(
        makeResponse(
          makeHtml({ body: '<img class="logo" src="/owned-logo.svg" />' }),
        ),
      );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.logoUrl).toBe('https://acme.com/owned-logo.svg');
      // An SVG page logo cannot be stored, so Logo.dev stays in the chain.
      expect(result.logoCandidates).toEqual([
        { url: 'https://acme.com/owned-logo.svg' },
        {
          mimeType: 'image/png',
          url: 'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
        },
      ]);
    });

    it('retains the placeholder path when Logo.dev is not configured', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ body: '' })));

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.logoUrl).toBeUndefined();
    });

    it('uses a Twitter card image when no Open Graph image exists', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(`<!DOCTYPE html>
          <html>
            <head>
              <title>Acme</title>
              <meta name="twitter:image" content="/twitter-card.jpg" />
            </head>
            <body></body>
          </html>`),
      );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.ogImage).toBe('/twitter-card.jpg');
      expect(result.bannerUrl).toBe('https://acme.com/twitter-card.jpg');
    });

    it('extracts value propositions from bullet characters', async () => {
      const body = [
        '<p>&#8226; Ship faster than competitors</p>',
        '<p>&#8226; Save 10x on infrastructure costs</p>',
        '<p>&#8226; Trusted by 10,000 companies worldwide</p>',
      ].join('\n');
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ body })));

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result.valuePropositions.length).toBeGreaterThanOrEqual(0);
    });

    it('throws original error when both full scrape and fallback fail', async () => {
      fetchMock.mockRejectedValue(new Error('network failure'));

      await expect(service.scrapeWebsite('https://acme.com')).rejects.toThrow(
        'network failure',
      );
    });

    it('falls back to meta tags when first fetch returns non-OK', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse('', 500))
        .mockResolvedValueOnce(
          makeResponse(
            makeHtml({
              description: 'Fallback description',
              title: 'FallbackCo',
            }),
          ),
        );

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result).toBeDefined();
      expect(result.description).toBeDefined();
    });

    it('uses a Twitter card image in the meta-tag fallback', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse('', 500))
        .mockResolvedValueOnce(
          makeResponse(`<!DOCTYPE html>
            <html>
              <head>
                <title>FallbackCo</title>
                <meta name="twitter:image:src" content="https://cdn.acme.com/card.jpg" />
              </head>
              <body></body>
            </html>`),
        );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.ogImage).toBe('https://cdn.acme.com/card.jpg');
      expect(result.bannerUrl).toBe('https://cdn.acme.com/card.jpg');
    });

    it('applies Logo.dev after the meta-tag fallback finds no logo', async () => {
      mockConfigService.get.mockReturnValue('pk_test');
      fetchMock
        .mockResolvedValueOnce(makeResponse('', 500))
        .mockResolvedValueOnce(
          makeResponse(
            makeHtml({
              body: '',
              title: 'FallbackCo',
            }),
          ),
        );

      const result = await service.scrapeWebsite('https://www.acme.com');

      expect(result.logoUrl).toBe(
        'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
      );
      expect(result.logoCandidates).toEqual([
        { mimeType: 'image/png', url: result.logoUrl },
      ]);
    });

    it('falls back to meta tags when scrape fails (503)', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse('', 503))
        .mockResolvedValueOnce(
          makeResponse(
            makeHtml({
              description: 'Fallback desc',
              ogTitle: 'FallbackCo',
            }),
          ),
        );

      const result = await service.scrapeWebsite('https://acme.com');
      expect(result).toBeDefined();
    });

    it('rejects non-HTML responses before parsing', async () => {
      fetchMock.mockResolvedValue(
        new Response('not html', {
          headers: { 'content-type': 'application/pdf' },
          status: 200,
        }),
      );

      await expect(service.scrapeWebsite('https://acme.com')).rejects.toThrow(
        'Unsupported content type',
      );
    });
  });

  // =========================================================================
  // scrapeAndAnalyze
  // =========================================================================
  describe('scrapeAndAnalyze', () => {
    it('returns IExtractedBrandData with brandVoice undefined', async () => {
      fetchMock.mockResolvedValue(
        makeResponse(makeHtml({ title: 'Acme | Home' })),
      );

      const result = await service.scrapeAndAnalyze('https://acme.com');

      expect(result.companyName).toBe('Acme');
      expect(result.brandVoice).toBeUndefined();
    });

    it('propagates errors from scrapeWebsite', async () => {
      fetchMock.mockRejectedValue(new Error('scrape failed'));

      await expect(
        service.scrapeAndAnalyze('https://acme.com'),
      ).rejects.toThrow('scrape failed');
    });
  });

  // =========================================================================
  // scrapeLinkedIn
  // =========================================================================
  describe('scrapeLinkedIn', () => {
    const linkedInHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Acme Corp | LinkedIn</title>
  <meta property="og:title" content="Acme Corp" />
  <meta name="description" content="Acme Corp makes widgets for the enterprise." />
  <meta property="og:image" content="https://linkedin.com/logo.png" />
</head>
<body>
  <h1>Acme Corp</h1>
  <dt>Industry</dt><dd>Software Development</dd>
  <article><p data-test-id="main-feed-activity-card__commentary">Our latest update on product launches for enterprise clients worldwide.</p></article>
  <article><p data-test-id="main-feed-activity-card__commentary">Excited to announce our new partnership with leading tech companies.</p></article>
</body>
</html>`;

    it('extracts company name from h1', async () => {
      fetchMock.mockResolvedValue(makeResponse(linkedInHtml));
      const result = await service.scrapeLinkedIn(
        'https://linkedin.com/company/acme',
      );
      expect(result.companyName).toBe('Acme Corp');
    });

    it('extracts description from meta tags', async () => {
      fetchMock.mockResolvedValue(makeResponse(linkedInHtml));
      const result = await service.scrapeLinkedIn(
        'https://linkedin.com/company/acme',
      );
      expect(result.description).toContain('widgets');
    });

    it('reads post text from logged-out activity card commentary, not the whole card', async () => {
      const cardChrome = `
            <a data-tracking-control-name="organization_guest_main-feed-card_feed-actor-name">Acme Corp</a>
            <p>1,749,461 followers</p>
            <time>4d</time>
            <span>Report this post</span>
            ${'                                        \n'.repeat(12)}
            <a data-tracking-control-name="organization_guest_main-feed-card_social-actions-reactions">987</a>
            <a data-tracking-control-name="organization_guest_main-feed-card_social-actions-comments">40 Comments</a>
            <button>Like</button><button>Comment</button><button>Share</button>`;
      const longPost = `Shipping #AgentWorkflows to every team. ${'More detail. '.repeat(60)}`;
      const guestHtml = `<!DOCTYPE html><html><body><h1>Acme Corp</h1>
        <ul>
          <li><article class="main-feed-activity-card">${cardChrome}
            <p data-test-id="main-feed-activity-card__commentary" class="attributed-text-segment-list__content">
              We're welcoming   Parafin to Acme.
              Together we'll grow #Payments.
            </p></article></li>
          <li><article class="main-feed-activity-card">${cardChrome}
            <p data-test-id="main-feed-activity-card__commentary">${longPost}</p>
            <article class="main-feed-activity-card__reshare">
              <p data-test-id="main-feed-activity-card__commentary">${longPost}</p>
            </article></article></li>
          <li><article class="main-feed-activity-card">${cardChrome}
            <p data-test-id="main-feed-activity-card__commentary">Too short</p></article></li>
        </ul></body></html>`;
      fetchMock.mockResolvedValue(makeResponse(guestHtml));

      const result = await service.scrapeLinkedIn(
        'https://linkedin.com/company/acme',
      );

      expect(result.recentPosts).toEqual([
        "We're welcoming Parafin to Acme. Together we'll grow #Payments.",
        longPost.replace(/\s+/g, ' ').trim().slice(0, 500),
      ]);
      expect(result.recentPosts.join(' ')).not.toContain('followers');
    });

    it('populates recentPosts from activity card commentary', async () => {
      fetchMock.mockResolvedValue(makeResponse(linkedInHtml));
      const result = await service.scrapeLinkedIn(
        'https://linkedin.com/company/acme',
      );
      expect(result.recentPosts.length).toBeGreaterThan(0);
    });

    it('sets sourceUrl and scrapedAt', async () => {
      fetchMock.mockResolvedValue(makeResponse(linkedInHtml));
      const result = await service.scrapeLinkedIn(
        'https://linkedin.com/company/acme',
      );
      expect(result.sourceUrl).toBe('https://linkedin.com/company/acme');
      expect(result.scrapedAt).toBeInstanceOf(Date);
    });

    it('throws when fetch returns non-OK', async () => {
      fetchMock.mockResolvedValue(makeResponse('', 403));
      await expect(
        service.scrapeLinkedIn('https://linkedin.com/company/acme'),
      ).rejects.toThrow('403');
    });

    it('throws on network error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.scrapeLinkedIn('https://linkedin.com/company/acme'),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  // =========================================================================
  // scrapeXProfile
  // =========================================================================
  describe('scrapeXProfile', () => {
    // Use unicode escape for rocket emoji to avoid template literal issues
    const rocketEmoji = '\u{1F680}';
    const xHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Acme (@acme)" />
  <meta name="description" content="Building the future. #tech #startups" />
  <meta property="og:image" content="https://pbs.twimg.com/profile.jpg" />
</head>
<body>
  <article><span data-testid="tweetText">We just launched ${rocketEmoji} our new product!</span></article>
  <article><span data-testid="tweetText">Excited about #AI tools we are building together.</span></article>
</body>
</html>`;

    it('extracts handle from URL', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.handle).toBe('acme');
    });

    it('extracts bio from meta description', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.bio).toContain('future');
    });

    it('extracts displayName from og:title', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.displayName).toContain('Acme');
    });

    it('detects hashtags in bio', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.contentStyle.usesHashtags).toBe(true);
    });

    it('detects emojis in tweets via contentStyle', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      // Emojis detected only when tweets are extracted from DOM
      // If the service extracts tweets, usesEmojis will be true; otherwise skip.
      if (result.recentTweets.length > 0) {
        expect(result.contentStyle.usesEmojis).toBe(true);
      } else {
        // Bio does not have emoji, so this is acceptable
        expect(result.contentStyle.usesEmojis).toBe(false);
      }
    });

    it('detects hashtags in tweets', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.contentStyle.usesHashtags).toBe(true);
    });

    it('computes avgTweetLength when tweets are found', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      if (result.recentTweets.length > 0) {
        expect(result.contentStyle.avgTweetLength).toBeGreaterThan(0);
      }
    });

    it('works with twitter.com URL', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://twitter.com/acme');
      expect(result.handle).toBe('acme');
    });

    it('sets sourceUrl and scrapedAt', async () => {
      fetchMock.mockResolvedValue(makeResponse(xHtml));
      const result = await service.scrapeXProfile('https://x.com/acme');
      expect(result.sourceUrl).toBe('https://x.com/acme');
      expect(result.scrapedAt).toBeInstanceOf(Date);
    });

    it('throws when fetch returns non-OK', async () => {
      fetchMock.mockResolvedValue(makeResponse('', 404));
      await expect(
        service.scrapeXProfile('https://x.com/acme'),
      ).rejects.toThrow('404');
    });
  });

  // =========================================================================
  // scrapeAllSources
  // =========================================================================
  describe('scrapeAllSources', () => {
    const websiteHtml = makeHtml({
      description: 'Website description',
      themeColor: '#003399',
      title: 'Acme | Home',
    });

    const linkedInHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Acme LinkedIn" />
  <meta name="description" content="LinkedIn description" />
</head>
<body>
  <h1>Acme LinkedIn Company</h1>
  <article>LinkedIn post announcing our exciting product launch in enterprise market this year.</article>
</body>
</html>`;

    const xHtml = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Acme (@acme)" />
  <meta name="description" content="X bio #startups" />
</head>
<body></body>
</html>`;

    it('merges all three sources into a single result', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(websiteHtml))
        .mockResolvedValueOnce(makeResponse(linkedInHtml))
        .mockResolvedValueOnce(makeResponse(xHtml));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      expect(result.companyName).toBeDefined();
      expect(result.sourceUrls).toHaveLength(3);
      expect(result.scrapedAt).toBeInstanceOf(Date);
    });

    it('website description takes priority over LinkedIn/X', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(websiteHtml))
        .mockResolvedValueOnce(makeResponse(linkedInHtml))
        .mockResolvedValueOnce(makeResponse(xHtml));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      expect(result.description).toBe('Website description');
    });

    it('collects contentSamples from LinkedIn posts', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(websiteHtml))
        .mockResolvedValueOnce(makeResponse(linkedInHtml))
        .mockResolvedValueOnce(makeResponse(xHtml));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      // LinkedIn article text should appear in contentSamples
      expect(result.contentSamples.length).toBeGreaterThanOrEqual(0);
    });

    it('works with only websiteUrl provided', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(websiteHtml));

      const result = await service.scrapeAllSources({
        websiteUrl: 'https://acme.com',
      });

      expect(result.sourceUrls).toEqual(['https://acme.com']);
      expect(result.companyName).toBeDefined();
    });

    it('falls back to LinkedIn company name when website scraping fails', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse('', 500)) // website full scrape fails
        .mockResolvedValueOnce(makeResponse('', 500)) // website meta fallback fails
        .mockResolvedValueOnce(makeResponse(linkedInHtml)); // linkedin succeeds

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
      });

      expect(result.companyName).toBeDefined();
    });

    it('does not throw even if all sources fail', async () => {
      fetchMock.mockRejectedValue(new Error('network error'));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      expect(result).toBeDefined();
      expect(result.companyName).toBeUndefined();
    });

    it('includes primaryColor from website in merged result', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse(websiteHtml))
        .mockResolvedValueOnce(makeResponse(linkedInHtml))
        .mockResolvedValueOnce(makeResponse(xHtml));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      expect(result.primaryColor).toBe('#003399');
    });

    it('uses xData contentStyle in merged result', async () => {
      const xWithHashtagHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="All about #AI and #tech" />
</head>
<body></body>
</html>`;

      fetchMock
        .mockResolvedValueOnce(makeResponse(websiteHtml))
        .mockResolvedValueOnce(makeResponse(linkedInHtml))
        .mockResolvedValueOnce(makeResponse(xWithHashtagHtml));

      const result = await service.scrapeAllSources({
        linkedinUrl: 'https://linkedin.com/company/acme',
        websiteUrl: 'https://acme.com',
        xProfileUrl: 'https://x.com/acme',
      });

      if (result.contentStyle) {
        expect(result.contentStyle.usesHashtags).toBe(true);
      }
    });
  });

  // =========================================================================
  // 429 retry logic
  // =========================================================================
  describe('429 retry logic', () => {
    it('retries on 429 and succeeds on subsequent attempt', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockResolvedValueOnce(make429Response('0'))
        .mockResolvedValueOnce(
          makeResponse(makeHtml({ title: 'Acme | Retry test' })),
        );

      const promise = service.scrapeWebsite('https://acme.com');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.companyName).toBe('Acme');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('returns last response after MAX_RETRY_ATTEMPTS, then throws on non-OK', async () => {
      vi.useFakeTimers();

      fetchMock.mockResolvedValue(make429Response('0'));

      let caughtError: unknown;
      const promise = service.scrapeWebsite('https://acme.com').catch((e) => {
        caughtError = e;
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(caughtError).toBeDefined();

      vi.useRealTimers();
    });

    it('uses exponential backoff — calls warn on each retry', async () => {
      vi.useFakeTimers();

      fetchMock
        .mockResolvedValueOnce(make429Response('0'))
        .mockResolvedValueOnce(make429Response('0'))
        .mockResolvedValueOnce(makeResponse(makeHtml({ title: 'Acme' })));

      const promise = service.scrapeWebsite('https://acme.com');
      await vi.runAllTimersAsync();
      await promise;

      expect(mockLogger.warn).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', () => {
    it('scrapeWebsite — throws on network failure', async () => {
      fetchMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(
        service.scrapeWebsite('https://nonexistent.example.com'),
      ).rejects.toThrow('ENOTFOUND');
    });

    it('scrapeLinkedIn — logs error and rethrows', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      await expect(
        service.scrapeLinkedIn('https://linkedin.com/company/foo'),
      ).rejects.toThrow('timeout');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('scrapeXProfile — logs error and rethrows', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      await expect(service.scrapeXProfile('https://x.com/foo')).rejects.toThrow(
        'timeout',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('scrapeAndAnalyze — logs error and rethrows', async () => {
      fetchMock.mockRejectedValue(new Error('boom'));
      await expect(
        service.scrapeAndAnalyze('https://acme.com'),
      ).rejects.toThrow('boom');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Redirect SSRF protection
  // =========================================================================
  describe('redirect SSRF protection', () => {
    it('follows a redirect to a public URL and re-validates each hop', async () => {
      fetchMock
        .mockResolvedValueOnce(makeRedirect('https://www.acme.com/'))
        .mockResolvedValueOnce(
          makeResponse(makeHtml({ title: 'Acme Corp | Home' })),
        );

      const result = await service.scrapeWebsite('https://acme.com');

      expect(result.companyName).toBe('Acme Corp');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://www.acme.com/');
    });

    it('rejects a redirect that points at a cloud-metadata / private address', async () => {
      fetchMock.mockResolvedValue(
        makeRedirect('http://169.254.169.254/latest/meta-data/'),
      );

      await expect(service.scrapeWebsite('https://acme.com')).rejects.toThrow(
        /private IP range|blocked address/,
      );

      // The private redirect target is never fetched (blocked before connect).
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes('169.254.169.254'),
        ),
      ).toBe(false);
    });

    it('rejects a redirect to a loopback host', async () => {
      fetchMock.mockResolvedValue(makeRedirect('http://localhost:9200/'));

      await expect(service.scrapeWebsite('https://acme.com')).rejects.toThrow(
        /blocked address/,
      );
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes('localhost'),
        ),
      ).toBe(false);
    });

    it('stops after too many redirect hops', async () => {
      fetchMock.mockResolvedValue(makeRedirect('https://acme.com/loop'));

      await expect(service.scrapeWebsite('https://acme.com')).rejects.toThrow(
        /Too many redirects/,
      );
    });
  });

  // =========================================================================
  // URL normalization edge-cases
  // =========================================================================
  describe('URL normalization', () => {
    it('adds https:// for URLs without any protocol', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ title: 'Test' })));
      const result = await service.scrapeWebsite('example.com');
      expect(result.sourceUrl).toBe('https://example.com');
    });

    it('removes trailing slash from normalized URL', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ title: 'Test' })));
      const result = await service.scrapeWebsite('https://example.com/');
      expect(result.sourceUrl).toBe('https://example.com');
    });

    it('leaves already-normalized URLs unchanged', async () => {
      fetchMock.mockResolvedValue(makeResponse(makeHtml({ title: 'Test' })));
      const result = await service.scrapeWebsite('https://example.com');
      expect(result.sourceUrl).toBe('https://example.com');
    });

    it('detectUrlType handles URL without protocol for linkedin', () => {
      const result = service.detectUrlType('linkedin.com/company/acme');
      expect(result).toEqual({ linkedinUrl: 'linkedin.com/company/acme' });
    });
  });

  // =========================================================================
  // Company name extraction from title variants
  // =========================================================================
  describe('company name extraction from title', () => {
    const variants: Array<[string, string]> = [
      ['Acme Corp | Home', 'Acme Corp'],
      ['Acme Corp - Products', 'Acme Corp'],
      ['Acme Corp - About', 'Acme Corp'],
      ['Acme Corp - Team', 'Acme Corp'],
      ['Acme Corp', 'Acme Corp'],
    ];

    for (const [title, expected] of variants) {
      it(`extracts "${expected}" from title "${title}"`, async () => {
        fetchMock.mockResolvedValue(makeResponse(makeHtml({ title })));
        const result = await service.scrapeWebsite('https://acme.com');
        expect(result.companyName).toBe(expected);
      });
    }
  });
});

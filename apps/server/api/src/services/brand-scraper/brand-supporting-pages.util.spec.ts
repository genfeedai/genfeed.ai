import {
  addSupportingPages,
  extractPageExcerpt,
  pickSupportingPageUrls,
} from '@api/services/brand-scraper/brand-supporting-pages.util';

describe('pickSupportingPageUrls', () => {
  it.each([
    {
      name: 'picks about, then product, then pricing, two at most',
      links: ['/pricing', '/products', '/about', '/blog'],
      expected: ['https://acme.example/about', 'https://acme.example/products'],
    },
    {
      name: 'ignores other hosts, other schemes and the homepage',
      links: [
        'https://other.example/about',
        'mailto:hi@acme.example',
        'javascript:void(0)',
        '/',
      ],
      expected: [],
    },
    {
      name: 'treats www and the bare host as the same site and drops queries',
      links: ['https://www.acme.example/pricing?utm=1#plans'],
      expected: ['https://www.acme.example/pricing'],
    },
    {
      name: 'keeps one page per kind',
      links: ['/about', '/about-us', '/company'],
      expected: ['https://acme.example/about'],
    },
  ])('$name', ({ links, expected }) => {
    expect(pickSupportingPageUrls(links, 'https://acme.example')).toEqual(
      expected,
    );
  });
});

describe('extractPageExcerpt', () => {
  it('excerpts the readable copy and leaves out navigation, footer and scripts', () => {
    const excerpt = extractPageExcerpt(
      `<body>
        <nav><p>Home About Pricing Contact us right now please</p></nav>
        <script>var secret = 'script text that is long enough to count';</script>
        <h1>We make handmade ceramic pans for home cooks</h1>
        <p>Every pan is fired in our own studio and ships free this week.</p>
        <footer><p>Copyright Acme, all rights reserved worldwide today</p></footer>
      </body>`,
    );

    expect(excerpt).toBe(
      'We make handmade ceramic pans for home cooks Every pan is fired in our own studio and ships free this week.',
    );
  });

  it('keeps short headings and list items that together make a readable excerpt', () => {
    expect(
      extractPageExcerpt(
        '<body><h1>Handmade pans</h1><li>Fired in-house</li><li>Free shipping</li></body>',
      ),
    ).toBe('Handmade pans Fired in-house Free shipping');
  });

  it('returns nothing for a page without readable copy and caps long pages', () => {
    expect(extractPageExcerpt('<body><p>Hi</p></body>')).toBeUndefined();
    expect(
      extractPageExcerpt(`<body><p>${'word '.repeat(600)}</p></body>`),
    ).toHaveLength(900);
  });
});

describe('addSupportingPages', () => {
  const pageHtml =
    '<body><h1>We make handmade ceramic pans for home cooks</h1></body>';

  function run(finalUrl: string) {
    const scrapedData: Record<string, unknown> = {};
    const rawContent = {
      diagnostics: [],
      evidence: [],
      supportingPageUrls: ['https://acme.example/about'],
    };
    const http = {
      fetchWithRetry: vi.fn().mockResolvedValue({ ok: true }),
      readWebsiteBody: vi.fn().mockResolvedValue(pageHtml),
      releaseWebsiteResponse: vi.fn().mockResolvedValue(undefined),
      responseUrl: vi.fn().mockReturnValue(finalUrl),
    };
    const parser = {
      assertHtmlResponse: vi.fn(),
      sanitizeProvenanceUrl: vi.fn((url: string) => url),
    };
    return addSupportingPages(
      scrapedData as never,
      rawContent as never,
      { deadlineAt: performance.now() + 60_000 },
      { http, parser, userAgent: 'test' } as never,
    ).then(() => scrapedData);
  }

  it('reads a page that stays on the brand site, www or not', async () => {
    const data = await run('https://www.acme.example/about');

    expect(data.pageExcerpts).toEqual([
      'We make handmade ceramic pans for home cooks',
    ]);
  });

  it('ignores a page that redirected to another site', async () => {
    const data = await run('https://login.other.example/signin');

    expect(data.pageExcerpts).toBeUndefined();
  });
});

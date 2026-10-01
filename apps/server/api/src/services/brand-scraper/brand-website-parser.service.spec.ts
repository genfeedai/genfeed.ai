import { BrandWebsiteParserService } from '@api/services/brand-scraper/brand-website-parser.service';

describe('BrandWebsiteParserService', () => {
  const service = new BrandWebsiteParserService();

  it('extracts brand identity and resolves relative media URLs', () => {
    const parsed = service.parseHtml(
      `<!doctype html>
      <html>
        <head>
          <title>Acme | Better launches</title>
          <meta name="description" content="Launch faster with Acme">
          <meta name="theme-color" content="#123456">
          <meta property="og:image" content="/social-card.png">
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700" rel="stylesheet">
        </head>
        <body>
          <header><img alt="Acme logo" class="logo" src="/logo.svg"></header>
          <h1>Launch better products</h1>
          <a href="https://linkedin.com/company/acme">LinkedIn</a>
          <img alt="Product dashboard" src="/dashboard.png">
        </body>
      </html>`,
      'https://acme.example/about',
    );

    expect(parsed).toMatchObject({
      colors: { primary: '#123456' },
      fonts: ['Inter'],
      heroText: 'Launch better products',
      logoUrl: 'https://acme.example/logo.svg',
      socialLinks: { linkedin: 'https://linkedin.com/company/acme' },
      title: 'Acme | Better launches',
    });
    expect(parsed.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: 'https://acme.example/dashboard.png' }),
      ]),
    );
  });

  it('maps parsed website content into the public scraped-brand contract', () => {
    const parsed = service.parseHtml(
      '<title>Acme — Ship faster</title><body><h1>Ship faster</h1><img class="logo" src="/logo.png"><img src="/reference.png"></body>',
      'https://acme.example',
    );

    expect(
      service.extractBrandData(parsed, 'https://acme.example'),
    ).toMatchObject({
      companyName: 'Acme',
      logoUrl: 'https://acme.example/logo.png',
      referenceImageUrls: ['https://acme.example/reference.png'],
      sourceUrl: 'https://acme.example',
      tagline: 'Ship faster',
    });
  });

  it('orders logo candidates (page logo, touch icon, favicons by size) with declared types', () => {
    const parsed = service.parseHtml(
      `<html><head>
        <link rel="icon" href="/favicon.ico">
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
        <link rel="icon" type="image/png" sizes="192x192" href="/icon?h=192">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <meta property="og:image" content="/opengraph-image?abc">
        <meta property="og:image:type" content="image/png">
      </head><body><img class="logo" src="/logo.svg"></body></html>`,
      'https://acme.example',
    );

    expect(
      service.extractBrandData(parsed, 'https://acme.example'),
    ).toMatchObject({
      logoCandidates: [
        { url: 'https://acme.example/logo.svg' },
        { url: 'https://acme.example/apple-touch-icon.png' },
        { mimeType: 'image/png', url: 'https://acme.example/icon?h=192' },
        { mimeType: 'image/png', url: 'https://acme.example/favicon-32.png' },
        { url: 'https://acme.example/favicon.ico' },
      ],
      logoUrl: 'https://acme.example/logo.svg',
      ogImage: '/opengraph-image?abc',
      ogImageType: 'image/png',
    });
  });

  it('matches social links by hostname and ignores redirects or non-web links', () => {
    const parsed = service.parseHtml(
      `<body>
        <a href="https://example.com/redirect?next=https://facebook.com/acme">Redirect</a>
        <a href="mailto:hello@instagram.com">Email</a>
        <a href="https://m.facebook.com/acme">Facebook</a>
        <a href="https://x.com/acme">X</a>
      </body>`,
      'https://acme.example',
    );

    expect(parsed.socialLinks).toEqual({
      facebook: 'https://m.facebook.com/acme',
      twitter: 'https://x.com/acme',
    });
  });

  it('does not reuse the logo as the fallback banner', () => {
    const parsed = service.parseHtml(
      '<body><img class="logo" src="/logo.png"><img src="/banner.png"></body>',
      'https://acme.example',
    );

    expect(parsed).toMatchObject({
      bannerUrl: 'https://acme.example/banner.png',
      logoUrl: 'https://acme.example/logo.png',
    });
  });

  it.each([
    ['Acme | Platform', 'Acme'],
    ['Acme - Platform', 'Acme'],
    ['Acme — Platform', 'Acme'],
    ['Acme', 'Acme'],
  ])('extracts the company name from %s', (title, expected) => {
    expect(service.extractCompanyName(title)).toBe(expected);
  });

  it('rejects non-HTML responses before parsing', () => {
    const response = new Response('{}', {
      headers: { 'content-type': 'application/json' },
    });

    expect(() => service.assertHtmlResponse(response)).toThrow(
      'Unsupported content type: application/json',
    );
  });
});

describe('website CSS evidence', () => {
  const parser = new BrandWebsiteParserService();
  it('retains exact families, variable weights and declaration source without runtime claims', () => {
    const parsed = parser.parseHtml(
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Known+Face:wght@400"><style>h1 {font-family: 'Inline Face', serif;}</style>`,
      'https://acme.example/page',
      [
        {
          url: 'https://cdn.example/style.css?token=hidden#fragment',
          cssText: `@font-face {font-family: 'Acme Variable';font-weight:100 900;font-style:italic;src:url('/font.woff2')} body {font-family:'Acme Variable', 'Fallback Face', sans-serif;color:#123abc}`,
        },
      ],
    );
    expect(parsed.fonts).toEqual([
      'Known Face',
      'Inline Face',
      'Acme Variable',
      'Fallback Face',
    ]);
    expect(parsed.colors.primary).toBe('#123abc');
    expect(parsed.fontDetails).toContainEqual({
      family: 'Acme Variable',
      sourceUrl: 'https://cdn.example/style.css',
      weight: '100 900',
      style: 'italic',
      availability: 'unknown',
    });
    expect(
      parsed.evidence?.some(
        (entry) => entry.url === 'https://cdn.example/style.css',
      ),
    ).toBe(true);
    expect(
      parsed.evidence?.every((entry) => entry.confidence === undefined),
    ).toBe(true);
    expect(parsed.diagnostics?.map((entry) => entry.code)).toContain(
      'brand_scrape.font_availability_unknown',
    );
    expect(parsed.diagnostics?.map((entry) => entry.code)).toContain(
      'brand_scrape.css_cascade_unverified',
    );
  });
  it('uses the final page base, ignores markup base and deduplicates eligible link tokens', () => {
    expect(
      parser.extractStylesheetUrls(
        `<base href="https://evil.example/"><link rel="alternate STYLESHEET" href="../one.css#first"><link rel="stylesheet" href="../one.css#second"><link rel="stylesheet" disabled href="disabled.css"><link rel="stylesheet" href="data:text/css,body{}"><link rel="stylesheet" href="https://user:secret@cdn.example/a.css"><link rel="stylesheet" href="//cdn.example/two.css?q=1">`,
        'https://acme.example/final/page',
      ),
    ).toEqual([
      'https://acme.example/one.css',
      'https://cdn.example/two.css?q=1',
    ]);
  });
  it('omits unresolved and escaped families and caps candidates with diagnostics', () => {
    const parsed = parser.parseHtml(
      `<style>a{font-family:var(--font)} b{font-family:Bad\\\\Font} c{font-family:${Array.from({ length: 20 }, (_, i) => `'Family ${i}'`).join(',')}} d{font-family: '${'x'.repeat(513)}'}</style>`,
      'https://acme.example',
    );
    expect(parsed.fonts).toHaveLength(8);
    expect(parsed.fontDetails).toHaveLength(16);
    expect(parsed.fonts?.every((family) => family.startsWith('Family '))).toBe(
      true,
    );
    expect(parsed.diagnostics?.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        'brand_scrape.font_syntax_unsupported',
        'brand_scrape.font_candidate_limit',
      ]),
    );
  });
  it('removes credentials and omits signed provenance URLs', () => {
    expect(
      parser.sanitizeProvenanceUrl(
        'https://u:p@acme.example/a?ToKeN=s&ACCESS_TOKEN=t&api_key=x&apikey=y&key=z&signature=a&sig=b&credential=c&authorization=d&auth=e&password=f&secret=g&safe=yes#fragment',
      ),
    ).toBe('https://acme.example/a?safe=yes');
    const parsed = parser.parseHtml('', 'https://acme.example', [
      {
        url: 'https://cdn.example/a?X-Amz-Credential=secret',
        cssText: "a{font-family:'Signed Face'}",
      },
    ]);
    expect(parsed.fontDetails?.[0].sourceUrl).toBe('');
    expect(
      parsed.evidence?.find(
        (entry) => entry.label === 'Stylesheet font declaration',
      )?.url,
    ).toBeUndefined();
  });
});

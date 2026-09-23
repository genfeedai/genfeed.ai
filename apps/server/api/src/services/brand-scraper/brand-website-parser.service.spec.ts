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

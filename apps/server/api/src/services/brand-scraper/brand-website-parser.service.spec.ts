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
      'Expected HTML response',
    );
  });
});

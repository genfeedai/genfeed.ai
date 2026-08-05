import { describe, expect, it } from 'vitest';
import { parsePage } from './page-parser';
import {
  auditPage,
  checkDuplicateDescriptions,
  checkDuplicateTitles,
  checkSitemapCoverage,
  checkSitemapEntriesResolve,
  checkSoftNotFound,
  checkStructuredData,
  collectBreadcrumbTargets,
  type PageInput,
} from './seo-rules';

const ORIGIN = 'https://genfeed.ai';

function page(head: string, body = '<p>body</p>'): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function input(path: string, html: string): PageInput {
  return {
    expectedCanonical: `${ORIGIN}${path}`,
    facts: parsePage(html),
    path,
  };
}

/** A page with nothing wrong, used as the baseline every test perturbs. */
function healthyHtml(
  path: string,
  overrides: Partial<Record<string, string>> = {},
): string {
  const title =
    overrides.title ?? 'Genfeed Integrations for Every Social Platform';
  const description =
    overrides.description ??
    'Connect Genfeed to every platform you publish on, then schedule, review, and measure each post from a single shared workspace.';
  const words = Array.from({ length: 240 }, (_, i) => `word${i}`).join(' ');
  return page(
    `<title>${title}</title>
     <meta name="description" content="${description}" />
     <link rel="canonical" href="${ORIGIN}${path}" />
     <meta property="og:title" content="${title}" />
     <meta property="og:description" content="${description}" />
     <meta property="og:image" content="${ORIGIN}/card.jpg" />
     <meta property="og:url" content="${ORIGIN}${path}" />
     <meta property="og:type" content="website" />
     <meta name="twitter:card" content="summary_large_image" />`,
    `<h1>Integrations</h1><p>${words}</p><a href="/pricing">Pricing</a>`,
  );
}

describe('page parser', () => {
  it('extracts title, description, canonical, headings and social tags', () => {
    const facts = parsePage(healthyHtml('/integrations'));

    expect(facts.title).toBe('Genfeed Integrations for Every Social Platform');
    expect(facts.canonical).toBe(`${ORIGIN}/integrations`);
    expect(facts.h1s).toEqual(['Integrations']);
    expect(facts.openGraph['og:type']).toBe('website');
    expect(facts.twitter['twitter:card']).toBe('summary_large_image');
    expect(facts.internalLinkCount).toBe(1);
  });

  it('decodes entities and ignores script and style text in the word count', () => {
    const facts = parsePage(
      page(
        '<title>A &amp; B</title>',
        '<script>const a = "ignored ignored ignored";</script><style>.x{color:red}</style><p>one two three</p>',
      ),
    );

    expect(facts.title).toBe('A & B');
    expect(facts.wordCount).toBe(3);
  });

  it('counts images that omit alt entirely but not empty decorative alts', () => {
    const facts = parsePage(
      page('<title>t</title>', '<img src="/a.png"><img src="/b.png" alt="">'),
    );

    expect(facts.imagesWithoutAlt).toBe(1);
  });
});

describe('soft 404 detection', () => {
  it('flags a 200 response whose title says the page does not exist', () => {
    // Regression guard: /articles/<any-slug> shipped exactly this shape.
    const html = page(
      `<title>Article not found</title>
       <meta name="description" content="The article you are looking for does not exist." />`,
      '<p>Nothing here.</p>',
    );

    const findings = checkSoftNotFound(input('/articles/ghost-slug', html));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('soft-404');
    expect(findings[0]?.severity).toBe('error');
  });

  it('leaves a healthy page alone', () => {
    expect(
      checkSoftNotFound(input('/integrations', healthyHtml('/integrations'))),
    ).toEqual([]);
  });
});

describe('page-level rules', () => {
  it('reports nothing for a healthy page', () => {
    expect(
      auditPage(input('/integrations', healthyHtml('/integrations'))),
    ).toEqual([]);
  });

  it('flags a repeated identical h1', () => {
    // Regression guard: 14 pages rendered the layout title and the section
    // heading as two <h1> elements with the same text.
    const html = healthyHtml('/vs/jasper').replace(
      '<h1>Integrations</h1>',
      '<h1>Genfeed vs Jasper</h1><h1>Genfeed vs Jasper</h1>',
    );

    const rules = auditPage(input('/vs/jasper', html)).map((f) => f.rule);

    expect(rules).toContain('h1-multiple');
  });

  it('flags a missing canonical and a canonical pointing elsewhere', () => {
    const withoutCanonical = healthyHtml('/faq').replace(
      `<link rel="canonical" href="${ORIGIN}/faq" />`,
      '',
    );
    const wrongCanonical = healthyHtml('/faq').replace(
      `href="${ORIGIN}/faq"`,
      `href="${ORIGIN}/"`,
    );

    expect(
      auditPage(input('/faq', withoutCanonical)).map((f) => f.rule),
    ).toContain('canonical-missing');
    expect(
      auditPage(input('/faq', wrongCanonical)).map((f) => f.rule),
    ).toContain('canonical-mismatch');
  });

  it('flags incomplete open graph tags', () => {
    const html = healthyHtml('/demo').replace(
      /<meta property="og:image"[^>]*\/>/,
      '',
    );

    const findings = auditPage(input('/demo', html));

    expect(findings.map((f) => f.rule)).toContain('open-graph-incomplete');
    expect(
      findings.find((f) => f.rule === 'open-graph-incomplete')?.detail,
    ).toContain('og:image');
  });

  it('flags title and description lengths outside the search-result window', () => {
    const short = auditPage(
      input('/faq', healthyHtml('/faq', { title: 'FAQ | Genfeed.ai' })),
    );
    const long = auditPage(
      input(
        '/vs',
        healthyHtml('/vs', {
          title:
            'Genfeed vs Alternatives (2026): AI Content Platform Comparisons | Genfeed.ai',
        }),
      ),
    );

    expect(short.map((f) => f.rule)).toContain('title-short');
    expect(long.map((f) => f.rule)).toContain('title-long');
  });

  it('flags a page with no internal links as a dead end', () => {
    const html = healthyHtml('/articles').replace(
      '<a href="/pricing">Pricing</a>',
      '',
    );

    expect(auditPage(input('/articles', html)).map((f) => f.rule)).toContain(
      'no-outgoing-links',
    );
  });
});

describe('structured data', () => {
  function withJsonLd(value: unknown): PageInput {
    return input(
      '/vs/jasper',
      healthyHtml('/vs/jasper').replace(
        '</head>',
        `<script type="application/ld+json">${JSON.stringify(value)}</script></head>`,
      ),
    );
  }

  it('accepts SoftwareApplication carrying offers but no rating', () => {
    // Google asks for one of offers/aggregateRating/review, not all three. The
    // old rule demanded aggregateRating outright, which would have pushed 28
    // product pages toward inventing ratings.
    expect(
      checkStructuredData(
        withJsonLd({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          applicationCategory: 'BusinessApplication',
          name: 'Genfeed',
          offers: {
            '@type': 'AggregateOffer',
            lowPrice: '0',
            priceCurrency: 'USD',
          },
        }),
      ),
    ).toEqual([]);
  });

  it('flags SoftwareApplication with no offers, rating, or review', () => {
    const findings = checkStructuredData(
      withJsonLd({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        applicationCategory: 'BusinessApplication',
        name: 'Genfeed',
      }),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain(
      'one of offers/aggregateRating/review',
    );
  });

  it('validates types nested inside another node', () => {
    // Regression guard: /pricing nested a Product with no image inside WebPage.
    const findings = checkStructuredData(
      withJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        mainEntity: {
          '@type': 'Product',
          name: 'Genfeed Pro',
          offers: { '@type': 'Offer', priceCurrency: 'USD' },
        },
      }),
    );
    const details = findings.map((f) => f.detail);

    expect(details.some((d) => d.startsWith('Product is missing image'))).toBe(
      true,
    );
    expect(details.some((d) => d.startsWith('Offer is missing price'))).toBe(
      true,
    );
  });

  it('reports unparseable JSON-LD instead of throwing', () => {
    const html = healthyHtml('/pricing').replace(
      '</head>',
      '<script type="application/ld+json">{ nope </script></head>',
    );

    expect(checkStructuredData(input('/pricing', html))[0]?.rule).toBe(
      'json-ld-invalid',
    );
  });

  it('accepts a SoftwareApplication carrying a rating but no offers', () => {
    expect(
      checkStructuredData(
        withJsonLd({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          aggregateRating: { ratingCount: 128, ratingValue: '4.8' },
          applicationCategory: 'BusinessApplication',
          name: 'Genfeed',
        }),
      ),
    ).toEqual([]);
  });

  it('collects breadcrumb targets in both string and node form', () => {
    const facts = parsePage(
      healthyHtml('/use-cases/agencies').replace(
        '</head>',
        `<script type="application/ld+json">${JSON.stringify({
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              item: `${ORIGIN}/`,
              name: 'Home',
              position: 1,
            },
            {
              '@type': 'ListItem',
              item: { '@id': `${ORIGIN}/use-cases` },
              name: 'Use cases',
              position: 2,
            },
          ],
        })}</script></head>`,
      ),
    );

    // Regression guard: position 2 pointed at /use-cases, which returned 404.
    expect(collectBreadcrumbTargets(facts)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/use-cases`,
    ]);
  });
});

describe('cross-page rules', () => {
  it('flags one finding per duplicated description', () => {
    // Regression guard: all 51 docs pages shared a single 45-char description.
    const shared = 'Generate AI-powered content for your business';
    const inputs = ['/a', '/b', '/c'].map((path) =>
      input(path, healthyHtml(path, { description: shared })),
    );

    const findings = checkDuplicateDescriptions(inputs);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.detail).toContain('Shared by 3 pages');
  });

  it('ignores descriptions that are unique', () => {
    const inputs = ['/a', '/b'].map((path) =>
      input(
        path,
        healthyHtml(path, {
          description: `Unique copy for ${path} `.padEnd(120, 'x'),
        }),
      ),
    );

    expect(checkDuplicateDescriptions(inputs)).toEqual([]);
  });

  it('flags duplicated titles', () => {
    const inputs = ['/a', '/b'].map((path) =>
      input(
        path,
        healthyHtml(path, { title: 'Genfeed Studio for Content Teams' }),
      ),
    );

    expect(checkDuplicateTitles(inputs)).toHaveLength(1);
  });

  it('flags indexable pages missing from the sitemap but skips noindex pages', () => {
    const indexable = input('/orphan', healthyHtml('/orphan'));
    const noindexed = input(
      '/private',
      healthyHtml('/private').replace(
        '</head>',
        '<meta name="robots" content="noindex, nofollow" /></head>',
      ),
    );

    const findings = checkSitemapCoverage(
      [indexable, noindexed],
      new Set(['/pricing']),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('/orphan');
  });

  it('flags sitemap entries that did not resolve', () => {
    const findings = checkSitemapEntriesResolve(
      new Set(['/pricing', '/gone']),
      new Set(['/pricing']),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.path).toBe('/gone');
    expect(findings[0]?.rule).toBe('sitemap-url-unreachable');
  });
});

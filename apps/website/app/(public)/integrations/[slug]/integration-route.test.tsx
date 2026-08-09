import {
  getAllIntegrationSlugs,
  getIntegrationBySlug,
} from '@data/integrations.data';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it } from 'vitest';
import IntegrationPage, {
  buildIntegrationPageJsonLd,
  generateMetadata,
  generateStaticParams,
} from './page';

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const KNOWN_SLUG = getAllIntegrationSlugs()[0] ?? '';

/** Pull the JSON-LD payloads out of a route element's `<script>` children. */
function readJsonLdScripts(element: ReactNode): unknown[] {
  if (!isValidElement(element)) {
    throw new Error('Expected the route to return a React element');
  }
  const fragment = element as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(fragment.props.children)
    .filter(
      (child): child is ReactElement<{ children?: ReactNode; type?: string }> =>
        isValidElement(child) && child.props.type === 'application/ld+json',
    )
    .map((script) => JSON.parse(String(script.props.children)));
}

describe('generateStaticParams', () => {
  it('emits one param entry per integration slug', () => {
    const slugs = getAllIntegrationSlugs();

    expect(slugs.length).toBeGreaterThan(0);
    expect(generateStaticParams()).toEqual(slugs.map((slug) => ({ slug })));
  });
});

describe('buildIntegrationPageJsonLd', () => {
  it('names the integration in the WebPage description and about block', () => {
    const integration = getIntegrationBySlug(KNOWN_SLUG);
    if (!integration) {
      throw new Error(`Expected integration fixture "${KNOWN_SLUG}"`);
    }

    const jsonLd = buildIntegrationPageJsonLd(
      integration,
      `https://genfeed.ai/integrations/${KNOWN_SLUG}`,
    ) as { about: { name: string }; description: string; name: string };

    expect(jsonLd.about.name).toBe(`${integration.name} content integration`);
    expect(jsonLd.name).toBe(`Genfeed for ${integration.name}`);
    expect(jsonLd.description).toContain(integration.name);
  });
});

describe('generateMetadata', () => {
  it('builds canonical and social metadata for a known integration', async () => {
    const integration = getIntegrationBySlug(KNOWN_SLUG);
    if (!integration) {
      throw new Error(`Expected integration fixture "${KNOWN_SLUG}"`);
    }

    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: KNOWN_SLUG }) },
      EMPTY_PARENT,
    );

    expect(String(meta.title)).toContain(integration.name);
    expect(meta.alternates?.canonical).toContain(`/integrations/${KNOWN_SLUG}`);
    expect(meta.openGraph?.type).toBe('website');
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('carries the parent OpenGraph images through', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [{ url: 'https://cdn.genfeed.ai/og.png' }] },
    }) as unknown as Parameters<typeof generateMetadata>[1];

    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: KNOWN_SLUG }) },
      parent,
    );

    expect(meta.twitter?.images).toEqual([
      { url: 'https://cdn.genfeed.ai/og.png' },
    ]);
  });

  it('falls back to a "not found" title for an unknown slug', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: 'not-an-integration' }) },
      EMPTY_PARENT,
    );

    expect(meta.title).toBe('Integration Not Found | Genfeed');
    expect(meta.alternates).toBeUndefined();
  });
});

describe('IntegrationPage', () => {
  it('renders integration and breadcrumb JSON-LD', async () => {
    const element = await IntegrationPage({
      params: Promise.resolve({ slug: KNOWN_SLUG }),
    });

    const [integrationJsonLd, breadcrumbJsonLd] = readJsonLdScripts(
      element,
    ) as [
      { '@type': string },
      { itemListElement: Array<{ name: string; position: number }> },
    ];

    expect(integrationJsonLd['@type']).toBe('WebPage');
    expect(breadcrumbJsonLd.itemListElement.map((item) => item.name)).toEqual([
      'Home',
      'Integrations',
      getIntegrationBySlug(KNOWN_SLUG)?.name ?? '',
    ]);
  });

  it('answers with a 404 for an unknown slug', async () => {
    await expect(
      IntegrationPage({ params: Promise.resolve({ slug: 'nope' }) }),
    ).rejects.toThrow();
  });
});

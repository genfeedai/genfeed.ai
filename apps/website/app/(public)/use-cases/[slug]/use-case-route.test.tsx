import { getAllUseCaseSlugs } from '@data/use-cases.data';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it } from 'vitest';
import UseCasesPage, {
  buildUseCaseBreadcrumbJsonLd,
  generateMetadata,
  generateStaticParams,
} from './page';
import { formatUseCaseSlug, getUseCaseBySlugCached } from './use-case-loader';

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const KNOWN_SLUG = getAllUseCaseSlugs()[0] ?? '';

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

describe('formatUseCaseSlug', () => {
  it('title-cases every dash-separated word', () => {
    expect(formatUseCaseSlug('social-media-managers')).toBe(
      'Social Media Managers',
    );
  });

  it('leaves a single word capitalised', () => {
    expect(formatUseCaseSlug('agencies')).toBe('Agencies');
  });
});

describe('getUseCaseBySlugCached', () => {
  it('resolves a known slug and returns undefined for an unknown one', async () => {
    await expect(getUseCaseBySlugCached(KNOWN_SLUG)).resolves.toBeTruthy();
    await expect(getUseCaseBySlugCached('nope')).resolves.toBeUndefined();
  });
});

describe('generateStaticParams', () => {
  it('emits one param entry per use-case slug', () => {
    const slugs = getAllUseCaseSlugs();

    expect(slugs.length).toBeGreaterThan(0);
    expect(generateStaticParams()).toEqual(slugs.map((slug) => ({ slug })));
  });
});

describe('buildUseCaseBreadcrumbJsonLd', () => {
  it('links home then the audience page', () => {
    const jsonLd = buildUseCaseBreadcrumbJsonLd(
      'Agencies',
      'https://genfeed.ai/use-cases/agencies',
    ) as { itemListElement: Array<{ item: string; name: string }> };

    expect(jsonLd.itemListElement).toEqual([
      expect.objectContaining({ item: 'https://genfeed.ai', name: 'Home' }),
      expect.objectContaining({
        item: 'https://genfeed.ai/use-cases/agencies',
        name: 'For Agencies',
      }),
    ]);
  });
});

describe('generateMetadata', () => {
  it('builds audience-specific metadata from the slug', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: KNOWN_SLUG }) },
      EMPTY_PARENT,
    );

    const audience = formatUseCaseSlug(KNOWN_SLUG);
    expect(meta.title).toBe(
      `Genfeed for ${audience}: AI Content Creation at Scale`,
    );
    expect(meta.description).toContain(audience.toLowerCase());
    expect(meta.alternates?.canonical).toContain(`/use-cases/${KNOWN_SLUG}`);
    expect(meta.openGraph?.images).toEqual([]);
  });

  it('carries the parent OpenGraph images through', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [{ url: 'https://cdn.genfeed.ai/og.png' }] },
    }) as unknown as Parameters<typeof generateMetadata>[1];

    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: KNOWN_SLUG }) },
      parent,
    );

    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.genfeed.ai/og.png' },
    ]);
  });
});

describe('UseCasesPage', () => {
  it('renders Service and breadcrumb JSON-LD for a known audience', async () => {
    const element = await UseCasesPage({
      params: Promise.resolve({ slug: KNOWN_SLUG }),
    });

    const [serviceJsonLd, breadcrumbJsonLd] = readJsonLdScripts(element) as [
      { '@type': string; audience: { audienceType: string } },
      { itemListElement: unknown[] },
    ];

    expect(serviceJsonLd['@type']).toBe('Service');
    expect(serviceJsonLd.audience.audienceType).toBe(
      formatUseCaseSlug(KNOWN_SLUG),
    );
    expect(breadcrumbJsonLd.itemListElement).toHaveLength(2);
  });

  it('answers with a 404 for an unknown audience', async () => {
    await expect(
      UseCasesPage({ params: Promise.resolve({ slug: 'nope' }) }),
    ).rejects.toThrow();
  });
});

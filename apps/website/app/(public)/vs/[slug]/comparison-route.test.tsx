import { getAllCompetitorSlugs } from '@data/competitors.data';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it } from 'vitest';
import {
  formatCompetitorSlug,
  getCompetitorBySlugCached,
} from './competitor-loader';
import Page, { generateMetadata, generateStaticParams } from './page';

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

const KNOWN_SLUG = getAllCompetitorSlugs()[0] ?? '';

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

describe('formatCompetitorSlug', () => {
  it('title-cases every dash-separated word', () => {
    expect(formatCompetitorSlug('opus-clip')).toBe('Opus Clip');
  });
});

describe('getCompetitorBySlugCached', () => {
  it('resolves a known slug and returns undefined for an unknown one', async () => {
    await expect(getCompetitorBySlugCached(KNOWN_SLUG)).resolves.toBeTruthy();
    await expect(getCompetitorBySlugCached('nope')).resolves.toBeUndefined();
  });
});

describe('generateStaticParams', () => {
  it('emits one param entry per competitor slug', () => {
    const slugs = getAllCompetitorSlugs();

    expect(slugs.length).toBeGreaterThan(0);
    expect(generateStaticParams()).toEqual(slugs.map((slug) => ({ slug })));
  });
});

describe('generateMetadata', () => {
  it('titles the page as a head-to-head comparison', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: KNOWN_SLUG }) },
      EMPTY_PARENT,
    );

    const name = formatCompetitorSlug(KNOWN_SLUG);
    expect(String(meta.title)).toContain(`Genfeed vs ${name}`);
    expect(meta.description).toContain(name);
    expect(meta.alternates?.canonical).toContain(`/vs/${KNOWN_SLUG}`);
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

describe('comparison page route', () => {
  it('renders comparison and breadcrumb JSON-LD naming the competitor', async () => {
    const element = await Page({
      params: Promise.resolve({ slug: KNOWN_SLUG }),
    });

    const [comparisonJsonLd, breadcrumbJsonLd] = readJsonLdScripts(element) as [
      {
        about: { '@type': string; name: string };
        mentions: { '@type': string; name: string };
        name: string;
      },
      { itemListElement: Array<{ name: string }> },
    ];

    const name = formatCompetitorSlug(KNOWN_SLUG);
    expect(comparisonJsonLd.about).toEqual({
      '@type': 'Thing',
      name: 'Genfeed',
    });
    expect(comparisonJsonLd.mentions).toEqual({
      '@type': 'Thing',
      name,
    });
    expect(JSON.stringify(comparisonJsonLd)).not.toContain(
      'SoftwareApplication',
    );
    expect(comparisonJsonLd.mentions.name).toBe(name);
    expect(comparisonJsonLd.name).toBe(`Genfeed vs ${name}`);
    expect(breadcrumbJsonLd.itemListElement.map((item) => item.name)).toEqual([
      'Home',
      'Comparisons',
      `vs ${name}`,
    ]);
  });

  it('answers with a 404 for an unknown competitor', async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: 'nope' }) }),
    ).rejects.toThrow();
  });
});

import { BEST_LISTS } from '@data/best-lists.data';
import { competitors } from '@data/competitors.data';
import { integrations } from '@data/integrations.data';
import { describe, expect, it } from 'vitest';

import { appProducts, getRelatedAppProducts } from './app-products.data';
import {
  getBestListRelatedLinks,
  getComparisonRelatedLinks,
  getIntegrationRelatedLinks,
  getLandingRelatedLinks,
  getProductRelatedLinks,
  getStandaloneRelatedLinks,
  getToolRelatedLinks,
  MIN_INBOUND_SIBLINGS,
  type RelatedLink,
  RING_SIZE,
  ringNeighbors,
} from './related-links.data';

/** How many of `slugs` link to `target`, when each page lists `linksOf(slug)`. */
function inboundCount(
  target: string,
  slugs: readonly string[],
  linksOf: (slug: string) => readonly RelatedLink[],
): number {
  return slugs.filter((slug) =>
    linksOf(slug).some((link) => link.href === target),
  ).length;
}

describe('ringNeighbors', () => {
  it('returns the items that follow, wrapping at the end', () => {
    expect(ringNeighbors(['a', 'b', 'c', 'd', 'e'], 3, 3)).toEqual([
      'e',
      'a',
      'b',
    ]);
  });

  it('never returns the item itself, even in a short list', () => {
    expect(ringNeighbors(['a', 'b'], 0, 3)).toEqual(['b']);
    expect(ringNeighbors(['a'], 0, 3)).toEqual([]);
  });

  it('gives every item exactly RING_SIZE inbound links', () => {
    const items = Array.from({ length: 11 }, (_, index) => `item-${index}`);
    const inbound = new Map<string, number>();
    items.forEach((_, index) => {
      for (const target of ringNeighbors(items, index)) {
        inbound.set(target, (inbound.get(target) ?? 0) + 1);
      }
    });

    expect([...inbound.values()].every((count) => count === RING_SIZE)).toBe(
      true,
    );
    expect(inbound.size).toBe(items.length);
  });
});

describe('related links reach every page of a family from its siblings', () => {
  it('comparisons', () => {
    const slugs = competitors.map((item) => item.slug);
    for (const slug of slugs) {
      expect(
        inboundCount(`/vs/${slug}`, slugs, getComparisonRelatedLinks),
      ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
    }
  });

  it('best lists, with the hub as the third source', () => {
    const slugs = BEST_LISTS.map((item) => item.slug);
    for (const slug of slugs) {
      expect(
        inboundCount(`/best/${slug}`, slugs, getBestListRelatedLinks) + 1,
      ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
    }
  });

  it('integrations', () => {
    const slugs = integrations.map((item) => item.slug);
    for (const slug of slugs) {
      expect(
        inboundCount(
          `/integrations/${slug}`,
          slugs,
          getIntegrationRelatedLinks,
        ),
      ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
    }
  });

  it('products', () => {
    const slugs = appProducts.map((item) => item.slug);
    for (const slug of slugs) {
      expect(
        inboundCount(`/products/${slug}`, slugs, (page) => [
          ...getProductRelatedLinks(page),
          // The "Works with" block the product page already renders.
          ...getRelatedAppProducts(page).map(
            (item): RelatedLink => ({
              description: item.tagline,
              href: `/products/${item.slug}`,
              label: item.name,
            }),
          ),
        ]),
      ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
    }
  });

  it('platform landing pages and the done-for-you family', () => {
    const platforms = [
      'youtube',
      'tiktok',
      'instagram',
      'linkedin',
      'facebook',
      'x',
      'threads',
      'pinterest',
    ];
    const doneForYou = [
      'founder-content',
      'launch-content',
      'podcast-to-content',
      'custom-models',
      'done-for-you',
    ];
    for (const family of [platforms, doneForYou]) {
      for (const slug of family) {
        expect(
          inboundCount(`/${slug}`, family, getLandingRelatedLinks),
        ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
      }
    }
  });

  it('free tools', () => {
    const tools = [
      '/tools/ai-model-selector',
      '/tools/youtube-outliers',
      '/tools/youtube-clipper',
      '/tools/youtube-long-form',
    ];
    for (const tool of tools) {
      expect(
        tools.filter((other) =>
          getToolRelatedLinks(other).some((link) => link.href === tool),
        ).length,
      ).toBeGreaterThanOrEqual(MIN_INBOUND_SIBLINGS);
    }
  });
});

describe('related link lists', () => {
  const lists: [string, readonly RelatedLink[]][] = [
    ...competitors.map((item): [string, readonly RelatedLink[]] => [
      `/vs/${item.slug}`,
      getComparisonRelatedLinks(item.slug),
    ]),
    ...integrations.map((item): [string, readonly RelatedLink[]] => [
      `/integrations/${item.slug}`,
      getIntegrationRelatedLinks(item.slug),
    ]),
    ...appProducts.map((item): [string, readonly RelatedLink[]] => [
      `/products/${item.slug}`,
      getProductRelatedLinks(item.slug),
    ]),
    ['/features', getStandaloneRelatedLinks('/features')],
    ['/faq', getStandaloneRelatedLinks('/faq')],
    ['/desktop', getStandaloneRelatedLinks('/desktop')],
  ];

  it.each(lists)(
    '%s never links to itself or twice to one page',
    (path, links) => {
      const hrefs = links.map((link) => link.href);

      expect(hrefs).not.toContain(path);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    },
  );

  it('gives a page outside every family no links', () => {
    expect(getLandingRelatedLinks('book-a-call')).toEqual([]);
    expect(getStandaloneRelatedLinks('/not-a-page')).toEqual([]);
  });
});

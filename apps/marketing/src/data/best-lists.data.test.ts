import { describe, expect, it } from 'vitest';

import { BEST_LISTS, getBestListEntries } from './best-lists.data';
import {
  buildBestListFaqJsonLd,
  buildBestListJsonLd,
} from './best-lists-jsonld';

describe('BEST_LISTS', () => {
  it('uses unique slugs', () => {
    const slugs = BEST_LISTS.map((list) => list.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(BEST_LISTS)('resolves every competitor in $slug', (list) => {
    expect(getBestListEntries(list)).toHaveLength(list.competitorSlugs.length);
  });

  it.each(BEST_LISTS)('keeps $slug within search snippet limits', (list) => {
    expect(list.title.length).toBeGreaterThanOrEqual(30);
    expect(list.title.length).toBeLessThanOrEqual(60);
    expect(list.description.length).toBeGreaterThanOrEqual(110);
    expect(list.description.length).toBeLessThanOrEqual(160);
  });

  it.each(BEST_LISTS)(
    'puts Genfeed first and numbers the rest from 2 in $slug',
    (list) => {
      const jsonLd = buildBestListJsonLd(list);

      expect(jsonLd.itemListElement[0]).toMatchObject({
        name: 'Genfeed',
        position: 1,
      });
      expect(jsonLd.itemListElement.map((item) => item.position)).toEqual(
        jsonLd.itemListElement.map((_, index) => index + 1),
      );
    },
  );

  it.each(BEST_LISTS)('answers one question per entry in $slug', (list) => {
    const faq = buildBestListFaqJsonLd(list);

    expect(faq.mainEntity).toHaveLength(list.competitorSlugs.length + 1);
  });
});

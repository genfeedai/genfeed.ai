import { describe, expect, it } from 'vitest';
import { getAllCompetitorSlugs, getCompetitorBySlug } from './competitors.data';
import {
  getAllIntegrationSlugs,
  getIntegrationBySlug,
} from './integrations.data';
import {
  getAllProductSlugs,
  getOpenSourceProducts,
  getProductBySlug,
  getRelatedProducts,
} from './products.data';
import { getApprovedTestimonials } from './testimonials.data';
import { getAllUseCaseSlugs, getUseCaseBySlug } from './use-cases.data';

describe('website catalog getters', () => {
  it('resolves every product slug and excludes self from related products', () => {
    const slugs = getAllProductSlugs();

    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const slug of slugs) {
      const product = getProductBySlug(slug);
      expect(product?.slug).toBe(slug);

      const related = getRelatedProducts(slug);
      expect(related.every((item) => item.slug !== slug)).toBe(true);
      expect(related.map((item) => item.slug)).toEqual(
        (product?.relatedProducts ?? []).filter((relatedSlug) =>
          slugs.includes(relatedSlug),
        ),
      );
    }

    expect(getProductBySlug('not-a-real-product')).toBeUndefined();
    expect(getRelatedProducts('not-a-real-product')).toEqual([]);
  });

  it('lists open-source products that publish a GitHub URL and are not Cursor', () => {
    const openSource = getOpenSourceProducts();

    expect(openSource.every((product) => Boolean(product.githubUrl))).toBe(
      true,
    );
    expect(openSource.every((product) => product.slug !== 'cursor')).toBe(true);
  });

  it('resolves every competitor, integration, and use-case slug', () => {
    for (const slug of getAllCompetitorSlugs()) {
      expect(getCompetitorBySlug(slug)?.slug).toBe(slug);
    }
    expect(getCompetitorBySlug('missing-competitor')).toBeUndefined();

    for (const slug of getAllIntegrationSlugs()) {
      expect(getIntegrationBySlug(slug)?.slug).toBe(slug);
    }
    expect(getIntegrationBySlug('missing-integration')).toBeUndefined();

    for (const slug of getAllUseCaseSlugs()) {
      expect(getUseCaseBySlug(slug)?.slug).toBe(slug);
    }
    expect(getUseCaseBySlug('missing-use-case')).toBeUndefined();
  });

  it('returns an empty approved-testimonial list until quotes clear review', () => {
    expect(getApprovedTestimonials()).toEqual([]);
    expect(getApprovedTestimonials(1)).toEqual([]);
  });
});

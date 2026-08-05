import { getProductBySlug } from '@data/products.data';
import * as PageModule from '@public/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/[slug]/page', PageModule);

describe('product page structured data', () => {
  it.each(['chatgpt', 'cursor', 'docs', 'extension', 'mcp', 'mobile'])(
    'describes /%s as a web page without unsupported review markup',
    (slug) => {
      const product = getProductBySlug(slug);
      if (!product) {
        throw new Error(`Expected product fixture "${slug}" to exist`);
      }

      const jsonLd = PageModule.buildProductPageJsonLd(
        product,
        `https://genfeed.ai/${slug}`,
      );
      const serialized = JSON.stringify(jsonLd);

      expect(jsonLd['@type']).toBe('WebPage');
      expect(serialized).not.toContain('SoftwareApplication');
      expect(serialized).not.toContain('aggregateRating');
      expect(serialized).not.toContain('review');
    },
  );
});

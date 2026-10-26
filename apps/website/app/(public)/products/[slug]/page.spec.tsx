import { getAllAppProductSlugs } from '@data/app-products.data';
import * as PageModule from '@public/products/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests(
  'apps/website/app/(public)/products/[slug]/page',
  PageModule,
);

describe('product route', () => {
  it('pre-renders every app product and nothing else', () => {
    expect(PageModule.generateStaticParams()).toEqual(
      getAllAppProductSlugs().map((slug) => ({ slug })),
    );
    expect(PageModule.dynamicParams).toBe(false);
  });
});

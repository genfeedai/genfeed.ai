import * as PageModule from '@public/use-cases/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests(
  'apps/website/app/(public)/use-cases/[slug]/page',
  PageModule,
);

describe('use-case breadcrumb structured data', () => {
  it.each([
    'agencies',
    'ai-influencers',
    'creators',
    'ecommerce',
    'founders',
    'marketers',
  ])('omits the nonexistent /use-cases parent for /use-cases/%s', (slug) => {
    const url = `https://genfeed.ai/use-cases/${slug}`;
    const jsonLd = PageModule.buildUseCaseBreadcrumbJsonLd(slug, url);

    expect(jsonLd.itemListElement).toHaveLength(2);
    expect(jsonLd.itemListElement.map((item) => item.item)).toEqual([
      'https://genfeed.ai',
      url,
    ]);
  });
});

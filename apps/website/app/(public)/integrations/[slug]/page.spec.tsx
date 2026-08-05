import {
  getAllIntegrationSlugs,
  getIntegrationBySlug,
} from '@data/integrations.data';
import * as PageModule from '@public/integrations/[slug]/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { describe, expect, it } from 'vitest';

runPageModuleTests(
  'apps/website/app/(public)/integrations/[slug]/page',
  PageModule,
);

describe('integration page structured data', () => {
  it.each(getAllIntegrationSlugs())(
    'describes /integrations/%s as a web page without unsupported review markup',
    (slug) => {
      const integration = getIntegrationBySlug(slug);
      if (!integration) {
        throw new Error(`Expected integration fixture "${slug}" to exist`);
      }

      const jsonLd = PageModule.buildIntegrationPageJsonLd(
        integration,
        `https://genfeed.ai/integrations/${slug}`,
      );
      const serialized = JSON.stringify(jsonLd);

      expect(jsonLd['@type']).toBe('WebPage');
      expect(serialized).not.toContain('SoftwareApplication');
      expect(serialized).not.toContain('aggregateRating');
      expect(serialized).not.toContain('review');
    },
  );
});

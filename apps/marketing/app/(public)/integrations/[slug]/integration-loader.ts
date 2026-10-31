import { getIntegrationBySlug } from '@data/integrations.data';
import { cache } from 'react';

export const getIntegrationBySlugCached = cache(async (slug: string) => {
  return getIntegrationBySlug(slug);
});

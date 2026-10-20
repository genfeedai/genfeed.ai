import { getCompetitorBySlug } from '@data/competitors.data';
import { cache } from 'react';

export const getCompetitorBySlugCached = cache(async (slug: string) => {
  return getCompetitorBySlug(slug);
});

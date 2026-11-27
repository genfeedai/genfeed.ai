import { getUseCaseBySlug } from '@data/use-cases.data';
import { cache } from 'react';

export const getUseCaseBySlugCached = cache(async (slug: string) => {
  return getUseCaseBySlug(slug);
});

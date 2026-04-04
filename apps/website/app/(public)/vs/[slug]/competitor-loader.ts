import { getCompetitorBySlug } from '@data/competitors.data';
import { cache } from 'react';

export function formatCompetitorSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const getCompetitorBySlugCached = cache(async (slug: string) => {
  return getCompetitorBySlug(slug);
});

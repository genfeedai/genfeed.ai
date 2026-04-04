import { getUseCaseBySlug } from '@data/use-cases.data';
import { cache } from 'react';

export function formatUseCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const getUseCaseBySlugCached = cache(async (slug: string) => {
  return getUseCaseBySlug(slug);
});

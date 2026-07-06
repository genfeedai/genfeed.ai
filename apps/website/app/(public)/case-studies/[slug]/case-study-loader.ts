import { getCaseStudyBySlug } from '@data/case-studies.data';
import { cache } from 'react';

export function formatCaseStudySlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const getCaseStudyBySlugCached = cache(async (slug: string) => {
  return getCaseStudyBySlug(slug);
});

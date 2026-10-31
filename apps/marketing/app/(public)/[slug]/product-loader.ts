import { getProductBySlug } from '@data/products.data';
import { cache } from 'react';

export const getProductBySlugCached = cache(async (slug: string) => {
  return getProductBySlug(slug);
});

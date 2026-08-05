import type { MetadataRoute } from 'next';
import { getPageMap } from 'nextra/page-map';
import { createDocsSitemap } from './seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return createDocsSitemap(await getPageMap());
}

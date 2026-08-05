import type { MetadataRoute } from 'next';

/**
 * The authenticated product origin has no indexable URLs. Keep a real, empty
 * XML sitemap endpoint so crawlers never receive the HTML app shell for the
 * sitemap URL declared by robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}

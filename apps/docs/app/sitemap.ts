import fs from 'node:fs';
import path from 'node:path';
import type { MetadataRoute } from 'next';
import { DOCS_ORIGIN, listContentRoutes } from '../lib/page-metadata';

/**
 * The docs site shipped without a sitemap, so its 51 pages were only ever
 * discoverable by crawling links. Generated from the content tree rather than a
 * hand-kept list, so a new MDX file is indexable the moment it lands.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const contentDir = path.join(process.cwd(), 'content');

  return listContentRoutes(contentDir).map(({ file, route }) => ({
    changeFrequency: 'weekly' as const,
    lastModified: lastModified(file),
    priority: route === '/' ? 1 : 0.7,
    url: route === '/' ? `${DOCS_ORIGIN}/` : `${DOCS_ORIGIN}${route}`,
  }));
}

/**
 * File mtime, so lastmod tracks a real edit. On a fresh CI checkout every file
 * carries the checkout time, which degrades to "the build date" — still true,
 * just less precise than a local build.
 */
function lastModified(file: string): Date {
  try {
    return fs.statSync(file).mtime;
  } catch {
    return new Date();
  }
}

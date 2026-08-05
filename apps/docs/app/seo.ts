import type { Metadata, MetadataRoute } from 'next';
import type { PageMapItem } from 'nextra';

export const DOCS_ORIGIN = 'https://docs.genfeed.ai';

function normalizeRoute(route: string): string {
  const segments = route.split('/').filter(Boolean).map(encodeURIComponent);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function getDocsUrl(route = '/'): string {
  return new URL(normalizeRoute(route), DOCS_ORIGIN).toString();
}

export function getCanonicalUrl(mdxPath?: readonly string[]): string {
  return getDocsUrl(mdxPath?.join('/') ?? '/');
}

export function withCanonicalMetadata(
  metadata: Metadata,
  mdxPath?: readonly string[],
): Metadata {
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: getCanonicalUrl(mdxPath),
    },
  };
}

function collectPageRoutes(pageMap: PageMapItem[], routes: Set<string>): void {
  for (const item of pageMap) {
    if ('children' in item) {
      collectPageRoutes(item.children, routes);
      continue;
    }

    if ('route' in item) {
      routes.add(item.route);
    }
  }
}

export function createDocsSitemap(
  pageMap: PageMapItem[],
): MetadataRoute.Sitemap {
  const routes = new Set<string>();
  collectPageRoutes(pageMap, routes);

  return [...routes].map((route) => ({
    changeFrequency: 'weekly',
    priority: route === '/' ? 1 : 0.7,
    url: getDocsUrl(route),
  }));
}

import type { Metadata, MetadataRoute } from 'next';
import type { PageMapItem } from 'nextra';

export const DOCS_ORIGIN = 'https://docs.genfeed.ai';

/**
 * Social identity for the docs host. The suffix is deliberately 18 characters:
 * Ahrefs flags a `<title>` under 15 characters as "Title too short", and the
 * shortest docs heading is `CLI`. Suffixing every route lifts the shortest
 * rendered title to 21 characters while keeping the longest at 58 — under the
 * 63-character "Title too long" ceiling. Changing the suffix length shifts both
 * ends, so `tests/seo-metadata.test.ts` pins the whole content tree.
 */
export const DOCS_SITE_NAME = 'Genfeed.ai Docs';
export const DOCS_TITLE_SUFFIX = ` | ${DOCS_SITE_NAME}`;
export const DOCS_TITLE_TEMPLATE = `%s${DOCS_TITLE_SUFFIX}`;
export const DOCS_DEFAULT_TITLE = 'Genfeed.ai Documentation';
export const DOCS_DESCRIPTION =
  'Documentation for Genfeed Community, Cloud, deployment, content workflows, provider-backed generation, publishing, and APIs.';
export const DOCS_SOCIAL_CARD_URL =
  'https://cdn.genfeed.ai/assets/cards/default.jpg';

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

/**
 * Nextra hands `generateMetadata` the MDX frontmatter as a bare title plus
 * description. Next.js shallow-replaces `openGraph` rather than merging it, so
 * a route that omits the object inherits the layout's generic card verbatim —
 * which is how all 55 docs routes ended up sharing one og:title and shipping no
 * og:url at all. Build the full card here instead of leaning on inheritance.
 */
function resolveSocialTitle(title: Metadata['title']): string {
  if (typeof title === 'string' && title.length > 0) {
    return `${title}${DOCS_TITLE_SUFFIX}`;
  }

  if (title && typeof title === 'object') {
    if ('absolute' in title && title.absolute.length > 0) {
      return title.absolute;
    }

    if ('default' in title && title.default.length > 0) {
      return `${title.default}${DOCS_TITLE_SUFFIX}`;
    }
  }

  return DOCS_DEFAULT_TITLE;
}

export function withPageSeoMetadata(
  metadata: Metadata,
  mdxPath?: readonly string[],
): Metadata {
  const canonical = getCanonicalUrl(mdxPath);
  const socialTitle = resolveSocialTitle(metadata.title);
  const description =
    typeof metadata.description === 'string' && metadata.description.length > 0
      ? metadata.description
      : DOCS_DESCRIPTION;
  const images = [DOCS_SOCIAL_CARD_URL];

  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical,
    },
    description,
    openGraph: {
      description,
      images,
      siteName: DOCS_SITE_NAME,
      title: socialTitle,
      type: 'website',
      url: canonical,
    },
    twitter: {
      card: 'summary_large_image',
      description,
      images,
      title: socialTitle,
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

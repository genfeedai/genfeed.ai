import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { Metadata, ResolvingMetadata } from 'next';

const OPEN_GRAPH_TYPE = 'website';
const TWITTER_CARD = 'summary_large_image';

/**
 * Turns a route path into an absolute canonical URL. An empty path is the site
 * root; a trailing slash is dropped so `/articles` and `/articles/` never ship
 * as two canonicals for the same page.
 */
function resolveCanonicalUrl(canonicalPath?: string): string | undefined {
  if (canonicalPath === undefined) {
    return undefined;
  }

  const withLeadingSlash =
    canonicalPath === '' || canonicalPath.startsWith('/')
      ? canonicalPath
      : `/${canonicalPath}`;
  const normalized =
    withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')
      ? withLeadingSlash.slice(0, -1)
      : withLeadingSlash;

  return `${metadata.url}${normalized}`;
}

/**
 * Next.js shallow-replaces the root layout's `openGraph` and `twitter` objects
 * with whatever a page returns, so a page that sets any Open Graph field drops
 * every root default it does not restate. Ahrefs reports "Open Graph tags
 * incomplete" when og:title, og:description, og:image or og:url is missing, so
 * all four — plus og:type, og:site_name and twitter:card — are emitted here
 * unconditionally rather than left to the caller.
 */
function buildMetadata(
  pageTitle: string,
  images: NonNullable<Metadata['openGraph']>['images'],
  description?: string,
  canonicalPath?: string,
): Metadata {
  const title = `${pageTitle} | ${metadata.name}`;
  const url = resolveCanonicalUrl(canonicalPath);
  const socialDescription = description ?? metadata.description;

  return {
    ...(url && { alternates: { canonical: url } }),
    ...(description && { description }),
    openGraph: {
      description: socialDescription,
      images,
      siteName: metadata.name,
      title,
      type: OPEN_GRAPH_TYPE,
      ...(url && { url }),
    },
    title,
    twitter: {
      card: TWITTER_CARD,
      description: socialDescription,
      images,
      title,
    },
  };
}

export function createPageMetadata(pageTitle: string, canonicalPath?: string) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return buildMetadata(pageTitle, previousImages, undefined, canonicalPath);
  };
}

interface ParamsWithKey<K extends string> {
  params: Promise<Record<K, string>>;
}

export function createDynamicPageMetadata<K extends string>(
  paramKey: K,
  formatter: (value: string) => string,
  canonicalPathBuilder?: (value: string) => string,
) {
  return async function generateMetadata(
    { params }: ParamsWithKey<K>,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const [resolvedParams, resolvedParent] = await Promise.all([
      params,
      parent,
    ]);
    const previousImages = resolvedParent.openGraph?.images || [];
    const value = resolvedParams[paramKey];

    return buildMetadata(
      formatter(value),
      previousImages,
      undefined,
      canonicalPathBuilder?.(value),
    );
  };
}

export function createPageMetadataWithDescription(
  pageTitle: string,
  description: string,
  canonicalPath?: string,
) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return buildMetadata(pageTitle, previousImages, description, canonicalPath);
  };
}

export function createPageMetadataWithCanonical(
  pageTitle: string,
  description: string,
  canonicalPath: string,
) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return buildMetadata(pageTitle, previousImages, description, canonicalPath);
  };
}

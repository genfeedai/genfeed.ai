import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { Metadata, ResolvingMetadata } from 'next';

function buildMetadata(
  pageTitle: string,
  images: NonNullable<Metadata['openGraph']>['images'],
  description?: string,
  canonicalPath?: string,
): Metadata {
  const title = `${pageTitle} | ${metadata.name}`;
  const url = canonicalPath ? `${metadata.url}${canonicalPath}` : undefined;

  return {
    ...(url && { alternates: { canonical: url } }),
    ...(description && { description }),
    openGraph: {
      ...(description && { description }),
      images,
      title,
      ...(url && { url }),
    },
    title,
    twitter: {
      ...(description && { description }),
      images,
      title,
    },
  };
}

export function createPageMetadata(pageTitle: string) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return buildMetadata(pageTitle, previousImages);
  };
}

interface ParamsWithKey<K extends string> {
  params: Promise<Record<K, string>>;
}

export function createDynamicPageMetadata<K extends string>(
  paramKey: K,
  formatter: (value: string) => string,
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

    return buildMetadata(formatter(value), previousImages);
  };
}

export function createPageMetadataWithDescription(
  pageTitle: string,
  description: string,
) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return buildMetadata(pageTitle, previousImages, description);
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

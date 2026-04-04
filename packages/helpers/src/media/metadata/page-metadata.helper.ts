import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { Metadata, ResolvingMetadata } from 'next';

export function createPageMetadata(pageTitle: string) {
  return async function generateMetadata(
    _props: unknown,
    parent: ResolvingMetadata,
  ): Promise<Metadata> {
    const previousImages = (await parent).openGraph?.images || [];

    return {
      openGraph: {
        images: previousImages,
      },
      title: `${pageTitle} | ${metadata.name}`,
      twitter: {
        images: previousImages,
      },
    };
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

    return {
      openGraph: { images: previousImages },
      title: `${formatter(value)} | ${metadata.name}`,
      twitter: { images: previousImages },
    };
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

    return {
      description,
      openGraph: {
        description,
        images: previousImages,
        title: `${pageTitle} | ${metadata.name}`,
      },
      title: `${pageTitle} | ${metadata.name}`,
      twitter: {
        description,
        images: previousImages,
        title: `${pageTitle} | ${metadata.name}`,
      },
    };
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

    return {
      alternates: {
        canonical: `${metadata.url}${canonicalPath}`,
      },
      description,
      openGraph: {
        description,
        images: previousImages,
        title: `${pageTitle} | ${metadata.name}`,
        url: `${metadata.url}${canonicalPath}`,
      },
      title: `${pageTitle} | ${metadata.name}`,
      twitter: {
        description,
        images: previousImages,
        title: `${pageTitle} | ${metadata.name}`,
      },
    };
  };
}

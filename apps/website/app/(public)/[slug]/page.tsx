import { getAllProductSlugs } from '@data/products.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { getProductBySlugCached } from '@public/[slug]/product-loader';
import ProductPage from '@public/[slug]/product-page';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  const slugs = getAllProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const { slug } = await params;
  const product = await getProductBySlugCached(slug);

  if (!product) {
    return {
      title: `${metadata.name} | Product Not Found`,
    };
  }

  const title = `${product.name} | ${product.tagline} | ${metadata.name}`;
  const description = product.description;
  const url = `${EnvironmentService.apps.website}/${product.slug}`;

  return {
    alternates: {
      canonical: url,
    },
    description,
    keywords: [
      product.name,
      product.category,
      ...product.targetAudience,
      'AI content',
      'content creation',
      'social media',
    ],
    openGraph: {
      description,
      images: [...previousImages],
      title,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description,
      images: [...previousImages],
      title,
    },
  };
}

export default async function ProductPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlugCached(slug);

  if (!product) {
    notFound();
  }

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'BusinessApplication',
    description: product.description,
    featureList: product.features.map((f) => f.title),
    name: product.name,
    offers: {
      '@type': 'AggregateOffer',
      description: product.pricing.why,
      highPrice: '4999',
      lowPrice: '0',
      offerCount: 4,
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web',
    publisher: {
      '@type': 'Organization',
      name: 'Genfeed',
      url: 'https://genfeed.ai',
    },
    url: `${EnvironmentService.apps.website}/${product.slug}`,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        item: 'https://genfeed.ai',
        name: 'Home',
        position: 1,
      },
      {
        '@type': 'ListItem',
        item: `https://genfeed.ai/features`,
        name: product.category,
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: `https://genfeed.ai/${product.slug}`,
        name: product.name,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(productJsonLd)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ProductPage product={product} />
      </Suspense>
    </>
  );
}

import {
  type AppProduct,
  getAllAppProductSlugs,
  getAppProductBySlug,
} from '@data/app-products.data';
import {
  buildAppProductBreadcrumbJsonLd,
  buildAppProductFaqJsonLd,
  buildAppProductJsonLd,
} from '@data/app-products-jsonld';
import { stringifyJsonLd } from '@data/json-ld';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AppProductContent from '@public/products/[slug]/app-product-content';
import { withMarketingOgMetadata } from '@web-components/og/marketing-metadata';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';

interface ProductRouteProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllAppProductSlugs().map((slug) => ({ slug }));
}

const generateBaseMetadata = createDynamicPageMetadata(
  'slug',
  (slug) => getAppProductBySlug(slug)?.seoTitle ?? 'Product',
  (slug) => `/products/${slug}`,
  (slug) => getAppProductBySlug(slug)?.description ?? 'Genfeed product page.',
);

export async function generateMetadata(
  props: ProductRouteProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = getAppProductBySlug(slug);
  const base = await generateBaseMetadata(props, parent);

  return withMarketingOgMetadata(
    base,
    `/products/${slug}`,
    product?.name ?? 'Genfeed',
  );
}

function ProductJsonLd({ product }: { product: AppProduct }) {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildAppProductJsonLd(product))}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(buildAppProductBreadcrumbJsonLd(product))}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(buildAppProductFaqJsonLd(product))}
      </script>
    </>
  );
}

export default async function AppProductPage({ params }: ProductRouteProps) {
  const { slug } = await params;
  const product = getAppProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <>
      <ProductJsonLd product={product} />
      <AppProductContent product={product} />
    </>
  );
}

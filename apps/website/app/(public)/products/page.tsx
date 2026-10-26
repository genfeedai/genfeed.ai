import { appProducts } from '@data/app-products.data';
import {
  buildAppProductsHubBreadcrumbJsonLd,
  buildAppProductsHubJsonLd,
} from '@data/app-products-jsonld';
import { stringifyJsonLd } from '@data/json-ld';
import ProductsHubContent from '@public/products/products-hub-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

const DESCRIPTION =
  'Every Genfeed app in one place: Playground, Storyboard, Clipper, Motion, Turbo, Editor, Agent, Automation, Publishing, Analytics, Discovery, Messages and Library.';

export const generateMetadata = createPageMetadataWithCanonical(
  'Products: Every Genfeed App',
  DESCRIPTION,
  '/products',
);

export default function ProductsPage() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildAppProductsHubJsonLd(appProducts, DESCRIPTION))}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(buildAppProductsHubBreadcrumbJsonLd())}
      </script>
      <ProductsHubContent />
    </>
  );
}

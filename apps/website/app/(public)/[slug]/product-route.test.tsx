import { getAllProductSlugs } from '@data/products.data';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it } from 'vitest';
import ProductPageRoute, {
  buildProductPageJsonLd,
  generateMetadata,
  generateStaticParams,
} from './page';
import { getProductBySlugCached } from './product-loader';

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

/** Pull the JSON-LD payloads out of a route element's `<script>` children. */
function readJsonLdScripts(element: ReactNode): unknown[] {
  if (!isValidElement(element)) {
    throw new Error('Expected the route to return a React element');
  }
  const fragment = element as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(fragment.props.children)
    .filter(
      (child): child is ReactElement<{ children?: ReactNode; type?: string }> =>
        isValidElement(child) && child.props.type === 'application/ld+json',
    )
    .map((script) => JSON.parse(String(script.props.children)));
}

describe('generateStaticParams', () => {
  it('emits one param entry per product slug', () => {
    const params = generateStaticParams();
    const slugs = getAllProductSlugs();

    expect(params).toHaveLength(slugs.length);
    expect(params).toEqual(slugs.map((slug) => ({ slug })));
    expect(slugs.length).toBeGreaterThan(0);
  });
});

describe('buildProductPageJsonLd', () => {
  it('describes the product as a WebPage that is part of the site', async () => {
    const product = await getProductBySlugCached('hire-agents');
    if (!product) {
      throw new Error('Expected fixture product "hire-agents" to exist');
    }

    const jsonLd = buildProductPageJsonLd(
      product,
      'https://genfeed.ai/hire-agents',
    );

    expect(jsonLd).toMatchObject({
      '@type': 'WebPage',
      about: {
        '@type': 'Thing',
        description: product.description,
        name: product.name,
      },
      isPartOf: { '@type': 'WebSite', name: 'Genfeed' },
      name: product.name,
      url: 'https://genfeed.ai/hire-agents',
    });
  });
});

describe('generateMetadata', () => {
  it('builds canonical, OpenGraph and Twitter metadata for a known product', async () => {
    const product = await getProductBySlugCached('hire-agents');
    if (!product) {
      throw new Error('Expected fixture product "hire-agents" to exist');
    }

    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: 'hire-agents' }) },
      EMPTY_PARENT,
    );

    expect(meta.description).toBe(product.description);
    expect(meta.alternates?.canonical).toContain('/hire-agents');
    expect(String(meta.title)).toContain(product.name);
    expect(meta.keywords).toEqual(
      expect.arrayContaining([product.name, product.category, 'AI content']),
    );
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('reuses the parent OpenGraph images', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [{ url: 'https://cdn.genfeed.ai/og.png' }] },
    }) as unknown as Parameters<typeof generateMetadata>[1];

    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: 'hire-agents' }) },
      parent,
    );

    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.genfeed.ai/og.png' },
    ]);
  });

  it('falls back to a "Product Not Found" title for an unknown slug', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ slug: 'not-a-real-product' }) },
      EMPTY_PARENT,
    );

    expect(String(meta.title)).toContain('Product Not Found');
    expect(meta.alternates).toBeUndefined();
  });
});

describe('ProductPageRoute', () => {
  it('renders product and breadcrumb JSON-LD alongside the product page', async () => {
    const element = await ProductPageRoute({
      params: Promise.resolve({ slug: 'hire-agents' }),
    });

    const [productJsonLd, breadcrumbJsonLd] = readJsonLdScripts(element) as [
      { '@type': string; name: string },
      { itemListElement: Array<{ name: string; position: number }> },
    ];

    expect(productJsonLd['@type']).toBe('WebPage');
    expect(
      breadcrumbJsonLd.itemListElement.map((item) => item.position),
    ).toEqual([1, 2, 3]);
    expect(breadcrumbJsonLd.itemListElement[0]?.name).toBe('Home');
    expect(breadcrumbJsonLd.itemListElement[2]?.name).toBe(productJsonLd.name);
  });

  it('answers with a 404 for an unknown slug', async () => {
    await expect(
      ProductPageRoute({ params: Promise.resolve({ slug: 'nope' }) }),
    ).rejects.toThrow();
  });
});

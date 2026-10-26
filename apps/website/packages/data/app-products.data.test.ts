import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  APP_PRODUCT_ACCESS_LABELS,
  APP_PRODUCT_GROUPS,
  appProducts,
  getAllAppProductSlugs,
  getAppProductBySlug,
  getRelatedAppProducts,
} from '@data/app-products.data';
import {
  buildAppProductBreadcrumbJsonLd,
  buildAppProductFaqJsonLd,
  buildAppProductJsonLd,
  buildAppProductsHubJsonLd,
} from '@data/app-products-jsonld';
import { ORGANIZATION_MODULE_IDS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('app products', () => {
  it('has a product page for every organization module plus Agent and Library', () => {
    const slugs = new Set(getAllAppProductSlugs());

    for (const moduleId of ORGANIZATION_MODULE_IDS) {
      expect(slugs, moduleId).toContain(moduleId);
    }
    expect(slugs).toContain('agent');
    expect(slugs).toContain('library');
    expect(slugs.size).toBe(appProducts.length);
  });

  it('defines every product completely', () => {
    for (const product of appProducts) {
      expect(product.slug, product.name).toMatch(/^[a-z]+$/);
      expect(product.seoTitle.length, product.slug).toBeLessThanOrEqual(60);
      expect(product.description.length, product.slug).toBeLessThanOrEqual(200);
      expect(product.definition, product.slug).toContain(product.name);
      expect(product.highlights.length, product.slug).toBe(3);
      expect(product.steps.length, product.slug).toBeGreaterThanOrEqual(3);
      expect(product.useCases.length, product.slug).toBeGreaterThanOrEqual(2);
      expect(product.outputs.length, product.slug).toBeGreaterThanOrEqual(2);
      expect(product.faqs.length, product.slug).toBeGreaterThanOrEqual(3);
      expect(product.screenshot.src).toBe(`/products/${product.slug}.webp`);
      expect(product.screenshot.alt.length).toBeGreaterThan(20);
      expect(APP_PRODUCT_GROUPS).toContain(product.group);
      expect(APP_PRODUCT_ACCESS_LABELS[product.access]).toBeTruthy();
    }
  });

  it('keeps related links pointing at real, different products', () => {
    for (const product of appProducts) {
      expect(product.related, product.slug).not.toContain(product.slug);
      expect(getRelatedAppProducts(product.slug).length, product.slug).toBe(
        product.related.length,
      );
    }
  });

  it('keeps titles and descriptions unique', () => {
    expect(new Set(appProducts.map((p) => p.seoTitle)).size).toBe(
      appProducts.length,
    );
    expect(new Set(appProducts.map((p) => p.description)).size).toBe(
      appProducts.length,
    );
  });

  it('describes access exactly as the organization modules do', () => {
    const access = (slug: string) => getAppProductBySlug(slug)?.access;

    expect(access('playground')).toBe('included');
    expect(access('clipper')).toBe('plugin');
    expect(access('automation')).toBe('plugin-paid');
    expect(access('messages')).toBe('plugin-paid');
    expect(access('discovery')).toBe('included-paid');
  });
});

describe('app product structured data', () => {
  const playground = getAppProductBySlug('playground');

  it('describes the product as software that belongs to the Genfeed suite', () => {
    expect(playground).toBeDefined();
    if (!playground) return;

    expect(buildAppProductJsonLd(playground)).toMatchObject({
      '@type': 'SoftwareApplication',
      applicationSuite: 'Genfeed',
      name: 'Genfeed Playground',
      url: 'https://genfeed.ai/products/playground',
    });
  });

  it('places the product under Home and Products in the breadcrumb', () => {
    if (!playground) return;

    const names = buildAppProductBreadcrumbJsonLd(
      playground,
    ).itemListElement.map((item) => item.name);
    expect(names).toEqual(['Home', 'Products', 'Playground']);
  });

  it('turns every FAQ into a question and answer pair', () => {
    if (!playground) return;

    const faq = buildAppProductFaqJsonLd(playground);
    expect(faq.mainEntity).toHaveLength(playground.faqs.length);
    expect(faq.mainEntity[0]).toMatchObject({ '@type': 'Question' });
  });

  it('lists every product on the hub in order', () => {
    const hub = buildAppProductsHubJsonLd(appProducts, 'All products');

    expect(hub.mainEntity.itemListElement).toHaveLength(appProducts.length);
    expect(hub.mainEntity.itemListElement[0]?.position).toBe(1);
  });
});

describe('app product screenshots', () => {
  it('ships a real capture for every product', () => {
    for (const product of appProducts) {
      const file = join(process.cwd(), 'public', product.screenshot.src);
      expect(existsSync(file), `${file} is missing`).toBe(true);
    }
  });
});

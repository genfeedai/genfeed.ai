import type * as cheerio from 'cheerio';

function selectedDomNodes(api: cheerio.CheerioAPI, selector: string) {
  return api(selector).toArray();
}

export type ParsedDomNode = ReturnType<typeof selectedDomNodes>[number];

const LAZY_IMAGE_ATTRIBUTES = [
  'src',
  'data-src',
  'data-original',
  'data-lazy-src',
];

/**
 * The real image URL of an `<img>`. Lazy-loading themes keep an inline
 * `data:` placeholder in `src` and the actual file in `data-src` (Shopify
 * themes also leave a `{width}` template in it), so a placeholder must not
 * hide the lazy attributes.
 */
export function readImageSource(
  $: cheerio.CheerioAPI,
  node: ParsedDomNode,
): { isSrcSet: boolean; value: string } | undefined {
  const element = $(node);
  for (const attribute of LAZY_IMAGE_ATTRIBUTES) {
    const value = element.attr(attribute)?.trim();
    if (value && !value.startsWith('data:')) {
      return {
        isSrcSet: false,
        value: value.replace(/\{width\}/g, '1024'),
      };
    }
  }
  for (const attribute of ['srcset', 'data-srcset']) {
    const value = element.attr(attribute)?.trim();
    if (value && !value.startsWith('data:')) {
      return { isSrcSet: true, value };
    }
  }
  return undefined;
}

/**
 * A brand mark is the logo, never a reference photo of what it sells: judged
 * by its class, id, or file name (Shopify's lazy logo image carries no class).
 */
export function isLogoImage(
  $: cheerio.CheerioAPI,
  node: ParsedDomNode,
): boolean {
  const element = $(node);
  const fileName = readImageSource($, node)?.value.split(/[?#]/)[0] ?? '';
  return /logo/iu.test(
    [
      element.attr('class'),
      element.attr('id'),
      fileName.slice(fileName.lastIndexOf('/') + 1),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Shopify storefronts render product grids client-side, so the HTML holds no
 * product photos; the scraper reads them from the public product feed.
 */
export function isShopifyStorefront($: cheerio.CheerioAPI): boolean {
  return (
    $(
      '[href*="cdn.shopify.com"], [src*="cdn.shopify.com"], [href*="/cdn/shop/"], [src*="/cdn/shop/"], meta[name="shopify-checkout-api-token"], meta[name="shopify-digital-wallet"]',
    ).length > 0
  );
}

/**
 * Storefronts often declare `http://` assets for an https page and rely on a
 * redirect, which the files service refuses to follow. Only an absolute URL on
 * the page's own host is rewritten; relative values stay verbatim.
 */
export function upgradeSameHostHttp(url: string, base: string): string {
  try {
    const target = new URL(url);
    const page = new URL(base);
    if (
      target.protocol === 'http:' &&
      page.protocol === 'https:' &&
      target.hostname === page.hostname
    ) {
      target.protocol = 'https:';
      return target.href;
    }
  } catch {
    // Relative or malformed values are returned unchanged.
  }
  return url;
}

function collectText(selector: string, limit: number): string[] {
  const items: string[] = [];
  for (const element of document.querySelectorAll(selector)) {
    const text = element.textContent?.trim();
    if (text) {
      items.push(text);
    }
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

function metaContent(property: string): string | null | undefined {
  return document
    .querySelector(`meta[property="${property}"]`)
    ?.getAttribute('content');
}

function buildMarketplacePrompt(): string | null {
  const title =
    document
      .querySelector('[data-testid="marketplace_pdp_title"], h1[dir="auto"]')
      ?.textContent?.trim() || metaContent('og:title');

  const price = document
    .querySelector(
      '[data-testid="marketplace_pdp_price"], span[aria-label*="Price"], div[aria-label*="price"]',
    )
    ?.textContent?.trim();

  const description = document
    .querySelector(
      '[data-testid="marketplace_pdp_description"], div[aria-label="Description"], div[role="main"] section div[dir="auto"]',
    )
    ?.textContent?.trim();

  const highlights = collectText(
    '[data-testid="marketplace_pdp_badge"], [data-testid="marketplace_pdp_feature"], [data-testid="marketplace_pdp_details"] li',
    3,
  ).join(', ');

  const similarAds = collectText(
    '[data-testid="marketplace_pdp_similar_listing"] span, a[aria-label*="Marketplace listing"] span',
    2,
  ).join('; ');

  const pieces = [
    title ? `Listing title: ${title}` : null,
    price ? `Price: ${price}` : null,
    highlights ? `Highlights: ${highlights}` : null,
    description ? `Description: ${description.slice(0, 240)}` : null,
    similarAds ? `Best nearby ads: ${similarAds}` : null,
  ].filter((text): text is string => Boolean(text));

  if (pieces.length === 0) {
    return null;
  }
  return `Use the best-performing Facebook Marketplace ad details to inspire a new, conversion-focused image: ${pieces.join('. ')}.`;
}

/** The prompt for "Generate image" from what the current page shows. */
export function buildImagePrompt(options: {
  platformName: string;
  postUrl?: string;
}): string {
  if (options.platformName === 'facebook-marketplace') {
    const marketplacePrompt = buildMarketplacePrompt();
    if (marketplacePrompt) {
      return marketplacePrompt;
    }
  }

  const ogTitle = metaContent('og:title');
  const ogDescription = metaContent('og:description');

  return [
    `Create a high-performing image for ${options.platformName} content leveraging the strongest ad angles on this page.`,
    ogTitle ? `Title: ${ogTitle}` : null,
    ogDescription ? `Details: ${ogDescription}` : null,
    options.postUrl ? `Source URL: ${options.postUrl}` : null,
    'Prioritize visuals that mirror the best ads to boost engagement.',
  ]
    .filter((text): text is string => Boolean(text))
    .join(' ');
}

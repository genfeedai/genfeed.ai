/**
 * Canonical Genfeed CDN base. Public, immutable brand / marketing / OG assets
 * live here (s3://cdn.genfeed.ai/assets/**) rather than in any app's `public/`
 * folder. A single fixed host is used in every environment on purpose: these
 * assets are identical everywhere, and social crawlers (OG/Twitter cards) need
 * one stable, publicly reachable URL — never a per-env or localhost host.
 */
export const CDN_BASE_URL = 'https://cdn.genfeed.ai';

/**
 * Static layout of s3://cdn.genfeed.ai/assets. One file per asset, no versions
 * or dates in names (replace the object in place; names cache for a day):
 *
 *   branding/logo.*          brand marks (baked into emails and JSON-LD: never move)
 *   cards/default.jpg        default card for apps and the console
 *   cards/articles/*         article card art (URLs are stored on article rows)
 *   placeholders/*           empty-state images
 *   starters/<app>/<name>.webp  starter-card thumbnails, one folder per app (playground/)
 *   site/pages/<slug>.webp   landing page heroes (+ <slug>.jpg for social OG art)
 *   site/shared/<name>.webp  heroes shared by several pages
 *   site/home/**             homepage hero and output-carousel video + posters
 *   site/proof/*             proof screenshots
 *   og/<id>.jpg              link-preview artwork rendered by the website OG routes
 *
 * User-generated media lives outside assets/ (ingredients/, banners/, logos/,
 * exports/) and is owned by the API, not by this tree.
 */
/**
 * Build an absolute CDN URL from an `/assets/...`-style path.
 *
 * @example cdnAsset('/assets/cards/default.jpg')
 *   → 'https://cdn.genfeed.ai/assets/cards/default.jpg'
 */
export function cdnAsset(assetPath: string): string {
  const normalizedPath = assetPath.startsWith('/')
    ? assetPath
    : `/${assetPath}`;
  return `${CDN_BASE_URL}${normalizedPath}`;
}

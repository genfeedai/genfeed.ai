/**
 * Canonical Genfeed CDN base. Public, immutable brand / marketing / OG assets
 * live here (s3://cdn.genfeed.ai/assets/**) rather than in any app's `public/`
 * folder. A single fixed host is used in every environment on purpose: these
 * assets are identical everywhere, and social crawlers (OG/Twitter cards) need
 * one stable, publicly reachable URL — never a per-env or localhost host.
 */
export const CDN_BASE_URL = 'https://cdn.genfeed.ai';

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

/**
 * Immutable product stills: `s3://cdn.genfeed.ai/assets/<surface>/<id>.webp`.
 * Agents use surface `agents`; other catalogs can reuse the same folder shape.
 */
export function cdnProductStill(surface: string, id: string): string {
  return cdnAsset(`/assets/${surface}/${id}.webp`);
}

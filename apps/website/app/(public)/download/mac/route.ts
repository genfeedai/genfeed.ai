import { redirectToLatestDesktopBuild } from '@data/desktop-release.data';

/**
 * Stable permalink to the newest macOS build:
 * `https://genfeed.ai/download/mac` always resolves to the current disk image,
 * so docs, the README, and release notes never carry a version-pinned URL.
 *
 * Deliberately unlinked from any page and absent from the sitemap — the SEO
 * gate (`bun run check:orphans`) fails on internal links that return 3xx, and
 * this route is a redirect by design. `/download` links straight to the release
 * asset instead.
 */
/** The Location header is per-release, not per-build: never bake it into HTML. */
export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return redirectToLatestDesktopBuild();
}

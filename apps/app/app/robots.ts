import type { MetadataRoute } from 'next';

/**
 * The studio is an authenticated product surface, not a marketing site. Only
 * `apps/website` (genfeed.ai) is meant to rank, so every crawler is disallowed
 * across the whole origin. Without this route `/robots.txt` falls through to
 * the App Router and serves the HTML app shell as a soft-404.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      disallow: '/',
      userAgent: '*',
    },
    sitemap: 'https://app.genfeed.ai/sitemap.xml',
  };
}

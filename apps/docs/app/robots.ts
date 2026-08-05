import type { MetadataRoute } from 'next';
import { DOCS_ORIGIN } from '../lib/page-metadata';

/**
 * Mirrors apps/website/app/robots.ts: open to everything, and explicit about the
 * answer-engine crawlers, since documentation is the content we most want them
 * to read. Points at the sitemap this app now generates.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { allow: '/', userAgent: '*' },
      { allow: '/', userAgent: 'GPTBot' },
      { allow: '/', userAgent: 'Claude-Web' },
      { allow: '/', userAgent: 'PerplexityBot' },
      { allow: '/', userAgent: 'Googlebot' },
      { allow: '/', userAgent: 'CCBot' },
    ],
    sitemap: `${DOCS_ORIGIN}/sitemap.xml`,
  };
}

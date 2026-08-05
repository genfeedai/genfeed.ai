import type { MetadataRoute } from 'next';
import { DOCS_ORIGIN } from './seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: '/',
      userAgent: '*',
    },
    sitemap: `${DOCS_ORIGIN}/sitemap.xml`,
  };
}

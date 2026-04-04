import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        allow: '/',
        disallow: '/private/',
        userAgent: '*',
      },
      {
        allow: '/',
        userAgent: 'GPTBot',
      },
      {
        allow: '/',
        userAgent: 'Claude-Web',
      },
      {
        allow: '/',
        userAgent: 'PerplexityBot',
      },
      {
        allow: '/',
        userAgent: 'Googlebot',
      },
      {
        allow: '/',
        userAgent: 'CCBot',
      },
    ],
    sitemap: 'https://genfeed.ai/sitemap.xml',
  };
}

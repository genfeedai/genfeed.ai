import type { MetadataRoute } from 'next';

/**
 * Only the two indexable entry points on this origin. Everything else is an
 * authenticated product surface and stays out of both robots.txt and here —
 * see `app/(public)/login/page.tsx` for why these two are the exception.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: 'monthly',
      priority: 0.5,
      url: 'https://app.genfeed.ai/login',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.5,
      url: 'https://app.genfeed.ai/sign-up',
    },
  ];
}

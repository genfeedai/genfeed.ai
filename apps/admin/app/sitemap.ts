import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: 'never',
      lastModified: new Date(),
      priority: 1,
      url: 'https://admin.genfeed.ai',
    },
  ];
}

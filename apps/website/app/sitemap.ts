import { getAllCompetitorSlugs } from '@data/competitors.data';
import { getAllIntegrationSlugs } from '@data/integrations.data';
import { getAllProductSlugs } from '@data/products.data';
import { getAllUseCaseSlugs } from '@data/use-cases.data';
import { PublicService } from '@services/external/public.service';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const productSlugs = getAllProductSlugs();
  const competitorSlugs = getAllCompetitorSlugs();
  const integrationSlugs = getAllIntegrationSlugs();
  const useCaseSlugs = getAllUseCaseSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      changeFrequency: 'daily',
      lastModified: new Date(),
      priority: 1,
      url: 'https://genfeed.ai',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/pricing',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/done-for-you',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/founder-content',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/linkedin-content',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/podcast-to-content',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/launch-content',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/features',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/about',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/creators',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/agencies',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/influencers',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/publisher',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/studio',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/workflows',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/integrations',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/core',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/cloud',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/host',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/articles',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/posts',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/faq',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/demo',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.6,
      url: 'https://genfeed.ai/gen',
    },
    {
      changeFrequency: 'yearly',
      lastModified: new Date(),
      priority: 0.3,
      url: 'https://genfeed.ai/privacy',
    },
    {
      changeFrequency: 'yearly',
      lastModified: new Date(),
      priority: 0.3,
      url: 'https://genfeed.ai/terms',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.3,
      url: 'https://genfeed.ai/llms.txt',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.3,
      url: 'https://genfeed.ai/llms-full.txt',
    },
  ];

  const productRoutes: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    changeFrequency: 'weekly',
    lastModified: new Date(),
    priority: 0.9,
    url: `https://genfeed.ai/${slug}`,
  }));

  const competitorRoutes: MetadataRoute.Sitemap = competitorSlugs.map(
    (slug) => ({
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.8,
      url: `https://genfeed.ai/vs/${slug}`,
    }),
  );

  const integrationRoutes: MetadataRoute.Sitemap = integrationSlugs.map(
    (slug) => ({
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.8,
      url: `https://genfeed.ai/integrations/${slug}`,
    }),
  );

  const useCaseRoutes: MetadataRoute.Sitemap = useCaseSlugs.map((slug) => ({
    changeFrequency: 'monthly',
    lastModified: new Date(),
    priority: 0.8,
    url: `https://genfeed.ai/for/${slug}`,
  }));

  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    const articles = await PublicService.getInstance().findPublicArticles({
      limit: 200,
      page: 1,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    articleRoutes = articles
      .filter((a) => a.slug)
      .map((a) => ({
        changeFrequency: 'weekly' as const,
        lastModified: a.updatedAt ? new Date(a.updatedAt) : new Date(),
        priority: 0.8,
        url: `https://genfeed.ai/articles/${a.slug}`,
      }));
  } catch {
    // API unavailable at build time — article URLs omitted from sitemap
  }

  const allRoutes = [
    ...staticRoutes,
    ...productRoutes,
    ...competitorRoutes,
    ...integrationRoutes,
    ...useCaseRoutes,
    ...articleRoutes,
  ];

  const seen = new Set<string>();
  return allRoutes.filter((route) => {
    if (seen.has(route.url)) {
      return false;
    }
    seen.add(route.url);
    return true;
  });
}

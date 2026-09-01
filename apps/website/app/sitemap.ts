import { getAllCompetitorSlugs } from '@data/competitors.data';
import { getAllIntegrationSlugs } from '@data/integrations.data';
import { launchArticleSlugs } from '@data/launch-articles.data';
import { getAllProductSlugs } from '@data/products.data';
import { getAllUseCaseSlugs } from '@data/use-cases.data';
import { PublicService } from '@services/external/public.service';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

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
    // High-ticket pitch pages: unlinked from nav/footer (direct-send sales
    // collateral) but kept indexable so a shared link can still rank.
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.6,
      url: 'https://genfeed.ai/retainer',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.6,
      url: 'https://genfeed.ai/dfy',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.6,
      url: 'https://genfeed.ai/fleet',
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
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/contact',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases/creators',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases/agencies',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/use-cases/ai-influencers',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/publishing',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/studio',
    },
    {
      changeFrequency: 'daily',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/models',
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
      priority: 0.9,
      url: 'https://genfeed.ai/agent',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/library',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/analytics',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/calendar',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/research',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/brand-os',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/tools',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/tools/youtube-clips',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.9,
      url: 'https://genfeed.ai/tools/youtube-long-form',
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
      url: 'https://genfeed.ai/cloud',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/services',
    },
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: 'https://genfeed.ai/self-hosted',
    },
    // Linked from the site footer (Platform) so the page is crawl-reachable
    // even while the first desktop build is still unpublished.
    {
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.6,
      url: 'https://genfeed.ai/download',
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
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/skills',
    },
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.7,
      url: 'https://genfeed.ai/vs',
    },
    // The HTML directory behind the footer's bottom bar: it links every hub so
    // no indexable page depends on the (deliberately short) footer nav.
    {
      changeFrequency: 'monthly',
      lastModified: new Date(),
      priority: 0.4,
      url: 'https://genfeed.ai/sitemap',
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

  // `intelligence` is superseded by the dedicated /analytics page and 301s there;
  // exclude it so the sitemap never lists a redirecting URL.
  const productRoutes: MetadataRoute.Sitemap = productSlugs
    .filter((slug) => slug !== 'intelligence')
    .map((slug) => ({
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
    url: `https://genfeed.ai/use-cases/${slug}`,
  }));

  let articleRoutes: MetadataRoute.Sitemap = [];
  try {
    const articles = await PublicService.getInstance().findAllPublicArticles({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    articleRoutes = articles.reduce<MetadataRoute.Sitemap>(
      (routes, article) => {
        if (!article.slug) {
          return routes;
        }

        routes.push({
          changeFrequency: 'weekly' as const,
          lastModified: article.updatedAt
            ? new Date(article.updatedAt)
            : new Date(),
          priority: 0.8,
          url: `https://genfeed.ai/articles/${article.slug}`,
        });

        return routes;
      },
      [],
    );
  } catch {
    // The committed launch-article fallback below keeps the initial public
    // corpus discoverable while a transient API failure is recovered.
  }

  const launchArticleRoutes: MetadataRoute.Sitemap = launchArticleSlugs.map(
    (slug) => ({
      changeFrequency: 'weekly',
      lastModified: new Date(),
      priority: 0.8,
      url: `https://genfeed.ai/articles/${slug}`,
    }),
  );

  const allRoutes = [
    ...staticRoutes,
    ...productRoutes,
    ...competitorRoutes,
    ...integrationRoutes,
    ...useCaseRoutes,
    ...articleRoutes,
    ...launchArticleRoutes,
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

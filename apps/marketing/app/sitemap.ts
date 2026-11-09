import { AGENT_CLIENT_CHANNEL_SLUGS } from '@data/agent-client-channels.data';
import { getAllAgentClientSlugs } from '@data/agent-clients.data';
import { getAllAppProductSlugs } from '@data/app-products.data';
import { getAllBestListSlugs } from '@data/best-lists.data';
import { getAllCompetitorSlugs } from '@data/competitors.data';
import { helpArticleSlugs } from '@data/help-articles.data';
import { getAllIntegrationSlugs } from '@data/integrations.data';
import { launchArticleSlugs } from '@data/launch-articles.data';
import { getAllProductSlugs } from '@data/products.data';
import { getAllUseCaseSlugs } from '@data/use-cases.data';
import { Platform } from '@genfeedai/contracts';
import {
  articleHandle,
  creatorArticlePath,
  creatorPostPath,
  creatorProfilePath,
  GENFEED_BRAND_HANDLE,
} from '@genfeedai/contracts/constants';
import { PublicService } from '@services/external/public.service';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://genfeed.ai';
/** The public brands endpoint caps a page at 100: the newest profiles. */
const SITEMAP_PROFILE_LIMIT = 100;
/** The newest posts published straight to Genfeed profiles. */
const SITEMAP_NATIVE_POST_LIMIT = 100;

function articleUrl(handle: string, slug: string): string {
  return `${SITE_URL}${creatorArticlePath(handle, slug)}`;
}

function profileRoute(handle: string): MetadataRoute.Sitemap[number] {
  return {
    changeFrequency: 'weekly',
    priority: 0.7,
    url: `${SITE_URL}${creatorProfilePath(handle)}`,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agentClientSlugs = getAllAgentClientSlugs();
  const productSlugs = getAllProductSlugs();
  const appProductSlugs = getAllAppProductSlugs();
  const competitorSlugs = getAllCompetitorSlugs();
  const integrationSlugs = getAllIntegrationSlugs();
  const useCaseSlugs = getAllUseCaseSlugs();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/changelog',
    },
    {
      changeFrequency: 'daily',
      priority: 1,
      url: 'https://genfeed.ai',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/pricing',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/done-for-you',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/founder-content',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/x',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/linkedin',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/instagram',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/tiktok',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/youtube',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/threads',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/facebook',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/pinterest',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/podcast-to-content',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/launch-content',
    },
    // High-ticket pitch pages: unlinked from nav/footer (direct-send sales
    // collateral) but kept indexable so a shared link can still rank.
    {
      changeFrequency: 'monthly',
      priority: 0.6,
      url: 'https://genfeed.ai/custom-models',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/features',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.8,
      url: 'https://genfeed.ai/about',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.7,
      url: 'https://genfeed.ai/contact',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases/creators',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/use-cases/agencies',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/use-cases/ai-influencers',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/products',
    },
    {
      changeFrequency: 'daily',
      priority: 0.9,
      url: 'https://genfeed.ai/models',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/benchmark',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/agent',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/developers',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/calendar',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/research',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/brand-os',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/experts',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/tools',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/tools/ai-model-selector',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/tools/youtube-clipper',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.9,
      url: 'https://genfeed.ai/tools/youtube-long-form',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/integrations',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/cloud',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/self-hosted',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.6,
      url: 'https://genfeed.ai/affiliates',
    },
    // Linked from the site footer (Platform) so the page is crawl-reachable
    // even while the first desktop build is still unpublished.
    {
      changeFrequency: 'weekly',
      priority: 0.6,
      url: 'https://genfeed.ai/desktop',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.8,
      url: 'https://genfeed.ai/articles',
    },
    {
      changeFrequency: 'daily',
      priority: 0.8,
      url: 'https://genfeed.ai/community',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/posts',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.7,
      url: 'https://genfeed.ai/faq',
    },
    {
      changeFrequency: 'weekly',
      priority: 0.7,
      url: 'https://genfeed.ai/skills',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.7,
      url: 'https://genfeed.ai/vs',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.8,
      url: 'https://genfeed.ai/best',
    },
    // The HTML directory behind the footer's bottom bar: it links every hub so
    // no indexable page depends on the (deliberately short) footer nav.
    {
      changeFrequency: 'monthly',
      priority: 0.4,
      url: 'https://genfeed.ai/sitemap',
    },
    {
      changeFrequency: 'yearly',
      priority: 0.3,
      url: 'https://genfeed.ai/privacy',
    },
    {
      changeFrequency: 'yearly',
      priority: 0.3,
      url: 'https://genfeed.ai/terms',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.3,
      url: 'https://genfeed.ai/llms.txt',
    },
    {
      changeFrequency: 'monthly',
      priority: 0.3,
      url: 'https://genfeed.ai/llms-full.txt',
    },
  ];

  const agentClientRoutes: MetadataRoute.Sitemap = agentClientSlugs.map(
    (slug) => ({
      changeFrequency: 'monthly',
      priority: 0.7,
      url: `https://genfeed.ai/${slug}`,
    }),
  );

  const agentClientChannelRoutes: MetadataRoute.Sitemap =
    agentClientSlugs.flatMap((slug) =>
      AGENT_CLIENT_CHANNEL_SLUGS.map((channel) => ({
        changeFrequency: 'monthly' as const,
        priority: 0.6,
        url: `https://genfeed.ai/${slug}/${channel}`,
      })),
    );

  const productRoutes: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    changeFrequency: 'weekly',
    priority: 0.9,
    url: `https://genfeed.ai/${slug}`,
  }));

  const appProductRoutes: MetadataRoute.Sitemap = appProductSlugs.map(
    (slug) => ({
      changeFrequency: 'weekly',
      priority: 0.9,
      url: `https://genfeed.ai/products/${slug}`,
    }),
  );

  const competitorRoutes: MetadataRoute.Sitemap = competitorSlugs.map(
    (slug) => ({
      changeFrequency: 'monthly',
      priority: 0.8,
      url: `https://genfeed.ai/vs/${slug}`,
    }),
  );

  const bestListRoutes: MetadataRoute.Sitemap = getAllBestListSlugs().map(
    (slug) => ({
      changeFrequency: 'monthly',
      priority: 0.8,
      url: `https://genfeed.ai/best/${slug}`,
    }),
  );

  const integrationRoutes: MetadataRoute.Sitemap = integrationSlugs.map(
    (slug) => ({
      changeFrequency: 'monthly',
      priority: 0.8,
      url: `https://genfeed.ai/integrations/${slug}`,
    }),
  );

  const useCaseRoutes: MetadataRoute.Sitemap = useCaseSlugs.map((slug) => ({
    changeFrequency: 'monthly',
    priority: 0.8,
    url: `https://genfeed.ai/use-cases/${slug}`,
  }));

  const articleHandles = new Set<string>([GENFEED_BRAND_HANDLE]);
  let articleRoutes: MetadataRoute.Sitemap = [];
  let hasLoadedPublicArticles = false;
  try {
    const articles = await PublicService.getInstance().findAllPublicArticles({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    hasLoadedPublicArticles = true;
    articleRoutes = articles.reduce<MetadataRoute.Sitemap>(
      (routes, article) => {
        if (!article.slug) {
          return routes;
        }

        const handle = articleHandle(article.brand?.slug);
        articleHandles.add(handle);
        routes.push({
          changeFrequency: 'weekly' as const,
          ...(article.updatedAt
            ? { lastModified: new Date(article.updatedAt) }
            : {}),
          priority: 0.8,
          url: articleUrl(handle, article.slug),
        });

        return routes;
      },
      [],
    );
  } catch {
    // Static launch/help slugs stay discoverable only while the public list
    // cannot be loaded. Unseeded slugs 404, so they must not be listed once
    // the API answers.
  }

  const knownArticleUrls = new Set(articleRoutes.map((route) => route.url));
  // The bundled launch and help articles are Genfeed's own.
  const fallbackArticleRoutes: MetadataRoute.Sitemap = hasLoadedPublicArticles
    ? []
    : [...launchArticleSlugs, ...helpArticleSlugs]
        .map((slug) => articleUrl(GENFEED_BRAND_HANDLE, slug))
        .filter((url) => !knownArticleUrls.has(url))
        .map((url) => ({
          changeFrequency: 'weekly' as const,
          priority: 0.8,
          url,
        }));

  // Every handle that published an article, plus the newest public profiles.
  const profileHandles = new Set(articleHandles);
  try {
    const brands = await PublicService.getInstance().findPublicBrands({
      limit: SITEMAP_PROFILE_LIMIT,
    });
    for (const brand of brands) {
      if (brand.slug) {
        profileHandles.add(brand.slug);
      }
    }
  } catch {
    // Profiles behind published articles stay listed without the brand list.
  }
  const profileRoutes: MetadataRoute.Sitemap = [...profileHandles].map(
    profileRoute,
  );

  // Posts published to a Genfeed profile have their own page there. Network
  // posts link out to the network instead, so they are not listed.
  let nativePostRoutes: MetadataRoute.Sitemap = [];
  try {
    const posts = await PublicService.getInstance().findPublicPosts({
      limit: SITEMAP_NATIVE_POST_LIMIT,
      platform: Platform.GENFEED,
    });
    nativePostRoutes = posts.flatMap((post) => {
      const handle = post.brand?.slug;
      if (!handle) {
        return [];
      }
      const lastModified = post.updatedAt ?? post.publishedAt;
      return [
        {
          changeFrequency: 'monthly' as const,
          ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
          priority: 0.6,
          url: `${SITE_URL}${creatorPostPath(handle, post.id)}`,
        },
      ];
    });
  } catch {
    // Profiles stay listed when the post list cannot be loaded.
  }

  const allRoutes = [
    ...staticRoutes,
    ...agentClientRoutes,
    ...agentClientChannelRoutes,
    ...productRoutes,
    ...appProductRoutes,
    ...competitorRoutes,
    ...bestListRoutes,
    ...integrationRoutes,
    ...useCaseRoutes,
    ...profileRoutes,
    ...articleRoutes,
    ...fallbackArticleRoutes,
    ...nativePostRoutes,
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

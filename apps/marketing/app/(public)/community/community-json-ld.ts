import {
  articleHandle,
  creatorArticlePath,
  creatorProfilePath,
} from '@genfeedai/contracts/constants';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { CommunityPageData } from './community-loader';

export const COMMUNITY_PATH = '/community';
export const COMMUNITY_DESCRIPTION =
  'See what creators publish on Genfeed: articles, videos and images from public profiles at genfeed.ai/@handle. Claim your handle and turn Genfeed into your portfolio.';

/**
 * The community page as a `CollectionPage` whose `ItemList` names every
 * creator and article it links, each at its canonical profile URL.
 */
export function buildCommunityJsonLd({
  articles,
  creators,
}: Pick<CommunityPageData, 'articles' | 'creators'>): Record<string, unknown> {
  const items = [
    ...creators.flatMap((brand) =>
      brand.slug
        ? [
            {
              name: brand.label?.trim() || `@${brand.slug}`,
              url: `${metadata.url}${creatorProfilePath(brand.slug)}`,
            },
          ]
        : [],
    ),
    ...articles.flatMap((article) =>
      article.slug
        ? [
            {
              name: article.label,
              url: `${metadata.url}${creatorArticlePath(articleHandle(article.brand?.slug), article.slug)}`,
            },
          ]
        : [],
    ),
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    description: COMMUNITY_DESCRIPTION,
    isPartOf: {
      '@type': 'WebSite',
      name: metadata.name,
      url: metadata.url,
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        name: item.name,
        position: index + 1,
        url: item.url,
      })),
      numberOfItems: items.length,
    },
    name: 'Genfeed Community',
    url: `${metadata.url}${COMMUNITY_PATH}`,
  };
}

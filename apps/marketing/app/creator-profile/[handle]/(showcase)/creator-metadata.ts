import {
  type CreatorProfileTab,
  creatorProfilePath,
  creatorTabPath,
} from '@genfeedai/contracts/constants';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import type { Metadata } from 'next';
import { getPublicBrandBySlug } from './creator-loader';

const TAB_TITLES: Record<CreatorProfileTab, string> = {
  articles: 'Articles',
  images: 'Images',
  posts: 'Posts',
  videos: 'Videos',
};

/**
 * The head of a creator's profile or one of its tabs. The social card is the
 * profile's own 1200x630 card (`og/route.tsx`): the banner whole across the
 * top, then the logo, name and handle.
 */
export async function buildCreatorMetadata(
  handle: string,
  tab: CreatorProfileTab | null = null,
): Promise<Metadata> {
  const path = tab ? creatorTabPath(handle, tab) : creatorProfilePath(handle);
  const url = `${EnvironmentService.apps.website}${path}`;

  try {
    const brand = await getPublicBrandBySlug(handle);

    // An unknown or private handle 404s; its head says so and names nothing.
    if (!brand) {
      return {
        robots: { follow: false, index: false },
        title: `Profile not found | ${metadata.name}`,
      };
    }

    const canonicalHandle = brand.slug || handle;
    const canonicalPath = tab
      ? creatorTabPath(canonicalHandle, tab)
      : creatorProfilePath(canonicalHandle);
    const canonicalUrl = `${EnvironmentService.apps.website}${canonicalPath}`;
    const name = brand.label?.trim() || `@${canonicalHandle}`;
    const title = tab
      ? `${TAB_TITLES[tab]} by ${name} (@${canonicalHandle}) | ${metadata.name}`
      : `${name} (@${canonicalHandle}) | ${metadata.name}`;
    const description =
      brand.description?.trim() ||
      `Articles, posts, images and videos by ${name} on ${metadata.name}.`;
    const socialImage = {
      height: 630,
      type: 'image/png',
      url: `${EnvironmentService.apps.website}${creatorProfilePath(canonicalHandle)}/og`,
      width: 1200,
    };
    const rssUrl = `${EnvironmentService.apiEndpoint}/public/rss/brands/${brand.id}`;

    return {
      alternates: {
        canonical: canonicalUrl,
        types: {
          'application/rss+xml': [
            { title: `${name} articles - RSS feed`, url: rssUrl },
          ],
        },
      },
      description,
      openGraph: {
        description,
        images: [
          { alt: `@${canonicalHandle} on ${metadata.name}`, ...socialImage },
        ],
        siteName: metadata.name,
        title,
        type: 'profile',
        url: canonicalUrl,
      },
      title,
      twitter: {
        card: 'summary_large_image',
        creator: brand.twitterHandle ? `@${brand.twitterHandle}` : undefined,
        description,
        images: [
          {
            alt: `@${canonicalHandle} on ${metadata.name}`,
            url: socialImage.url,
          },
        ],
        title,
      },
    };
  } catch (error) {
    logger.info(`GET /public/brands/${handle} degraded to fallback metadata`, {
      error,
      handle,
    });

    return {
      alternates: { canonical: url },
      description: `View @${handle} on ${metadata.name}`,
      title: `@${handle} | ${metadata.name}`,
    };
  }
}

import { metadata } from '@helpers/media/metadata/metadata.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import {
  getPublicBrandBySlug,
  getPublicProfilePageData,
} from '@u/[handle]/profile-loader';
import PublicProfileContent from '@u/[handle]/profile-page';
import type { Metadata, ResolvingMetadata } from 'next';

export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const handle = (await params)?.handle;

  if (!handle) {
    return {
      description: `View ${handle}'s profile on ${metadata.name}`,
      title: `${metadata.name} | ${handle}`,
    };
  }

  try {
    // Fetch brand data for dynamic Twitter card
    const brand = await getPublicBrandBySlug(handle);

    if (!brand) {
      return {
        description: `View ${handle}'s profile on ${metadata.name}`,
        openGraph: {
          description: `View ${handle}'s profile on ${metadata.name}`,
          images: [...previousImages],
          title: `${metadata.name} | ${handle}`,
        },
        title: `${metadata.name} | ${handle}`,
        twitter: {
          card: 'summary',
          description: `View ${handle}'s profile on ${metadata.name}`,
          images: [...previousImages],
          title: `${metadata.name} | ${handle}`,
        },
      };
    }

    const title = `${brand.label || handle} - ${metadata.name}`;
    const description =
      brand.description ||
      `Check out ${brand.label || handle}'s profile on ${metadata.name}`;
    const imageUrl =
      brand.bannerUrl ||
      `${EnvironmentService.assetsEndpoint}/placeholders/landscape.jpg`;
    const profileUrl = `${EnvironmentService.apps.website}/u/${handle}`;
    const rssUrl = `${EnvironmentService.apiEndpoint}/public/rss/brands/${brand.id}`;

    return {
      alternates: {
        types: {
          'application/rss+xml': [
            {
              title: `${brand.label || handle} Articles - RSS Feed`,
              url: rssUrl,
            },
          ],
        },
      },
      description,
      openGraph: {
        description,
        images: [
          {
            alt: `@${handle} Genfeed.ai profile`,
            height: 500,
            url: imageUrl,
            width: 1500,
          },
        ],
        title,
        type: 'profile',
        url: profileUrl,
      },
      title,
      twitter: {
        card: 'summary_large_image',
        creator: brand.twitterHandle ? `@${brand.twitterHandle}` : undefined,
        description,
        images: [
          {
            alt: `@${handle} Genfeed.ai profile`,
            url: imageUrl,
          },
        ],
        title,
      },
    };
  } catch (error) {
    // Fallback metadata if brand fetch fails
    logger.info(`GET /public/brands/${handle} degraded to fallback metadata`, {
      error,
      handle,
    });

    return {
      description: `View ${handle}'s profile on ${metadata.name}`,
      title: `${metadata.name} | ${handle}`,
    };
  }
}

export default async function PublicProfile({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profileData = await getPublicProfilePageData(handle);

  return <PublicProfileContent handle={handle} {...profileData} />;
}

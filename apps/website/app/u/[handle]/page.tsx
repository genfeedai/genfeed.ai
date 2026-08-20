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

  const profileUrl = `${EnvironmentService.apps.website}/u/${handle}`;

  try {
    // Fetch brand data for dynamic Twitter card
    const brand = await getPublicBrandBySlug(handle);

    if (!brand) {
      return {
        alternates: {
          canonical: profileUrl,
        },
        description: `View ${handle}'s profile on ${metadata.name}`,
        openGraph: {
          description: `View ${handle}'s profile on ${metadata.name}`,
          images: [...previousImages],
          siteName: metadata.name,
          title: `${metadata.name} | ${handle}`,
          type: 'profile',
          url: profileUrl,
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
    // The old fallback pointed at assets.genfeed.ai/placeholders/landscape.jpg,
    // which 404s — every brand without a banner shipped a broken OG card. The
    // shared CDN card is the only guaranteed-live artwork, and it is 1200x630,
    // so the declared dimensions follow the image actually being served.
    const bannerUrl =
      typeof brand.bannerUrl === 'string' && brand.bannerUrl.length > 0
        ? brand.bannerUrl
        : null;
    const socialImage = bannerUrl
      ? { height: 500, url: bannerUrl, width: 1500 }
      : { height: 630, url: metadata.cards.default, width: 1200 };
    const rssUrl = `${EnvironmentService.apiEndpoint}/public/rss/brands/${brand.id}`;

    return {
      alternates: {
        canonical: profileUrl,
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
            ...socialImage,
          },
        ],
        siteName: metadata.name,
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
            url: socialImage.url,
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

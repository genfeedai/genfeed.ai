import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import HomeContent from '@public/(home)/home-content';
import type { Metadata, ResolvingMetadata } from 'next';

const HOME_PAGE_TITLE = 'Genfeed.ai | Ask for content. Get it published.';

export async function generateMetadata(
  _params: unknown,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = [getMarketingOgImage('/', 'Genfeed.ai')];

  return {
    alternates: {
      canonical: metadata.url,
    },
    description: metadata.description,
    openGraph: {
      description: metadata.description,
      images: [...previousImages],
      siteName: metadata.name,
      title: HOME_PAGE_TITLE,
      type: 'website',
      url: metadata.url,
    },
    title: HOME_PAGE_TITLE,
    twitter: {
      card: 'summary_large_image',
      description: metadata.description,
      images: [...previousImages],
      title: HOME_PAGE_TITLE,
    },
  };
}

export default function HomePage() {
  return <HomeContent />;
}

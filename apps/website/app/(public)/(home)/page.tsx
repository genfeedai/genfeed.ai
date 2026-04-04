import { metadata } from '@helpers/media/metadata/metadata.helper';
import HomeContent from '@public/(home)/home-content';
import type { Metadata, ResolvingMetadata } from 'next';

export async function generateMetadata(
  _params: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];

  return {
    alternates: {
      canonical: metadata.url,
    },
    description: metadata.description,
    openGraph: {
      description: metadata.description,
      images: [...previousImages],
      title: `${metadata.name} | ${metadata.description}`,
      url: metadata.url,
    },
    title: `${metadata.name} | ${metadata.description}`,
    twitter: {
      description: metadata.description,
      images: [...previousImages],
    },
  };
}

export default function HomePage() {
  return <HomeContent />;
}

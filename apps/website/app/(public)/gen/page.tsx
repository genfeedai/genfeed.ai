import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import GenContent from '@public/gen/gen-content';
import type { Metadata } from 'next';

const title = `Should Genfeed Launch a Token? | ${metadata.name}`;
const description =
  "We're exploring creator rewards and asking whether a $GEN token makes sense. Nothing is promised.";

export function generateMetadata(): Metadata {
  return {
    alternates: {
      canonical: `${metadata.url}/gen`,
    },
    description,
    openGraph: {
      description,
      images: [getMarketingOgImage('/gen', title)],
      siteName: metadata.name,
      title,
      type: 'website',
      url: `${metadata.url}/gen`,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      creator: '@genfeedai',
      creatorId: '1928229187782848512',
      description,
      images: [getMarketingOgImage('/gen', title)],
      site: metadata.url,
      title,
    },
  };
}

export default function GenTokenPage() {
  return <GenContent />;
}

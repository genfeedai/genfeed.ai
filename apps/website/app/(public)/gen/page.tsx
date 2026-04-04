import { metadata } from '@helpers/media/metadata/metadata.helper';
import GenContent from '@public/gen/gen-content';
import type { Metadata } from 'next';

const title = `${metadata.name} | $GEN Token`;
const description =
  'The $GEN token powers the Genfeed ecosystem. Use tokens to unlock premium features, boost content visibility, and participate in platform governance.';

export function generateMetadata(): Metadata {
  return {
    alternates: {
      canonical: `${metadata.url}/gen`,
    },
    description,
    openGraph: {
      description,
      images: [metadata.cards.default],
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
      images: [metadata.cards.default],
      site: metadata.url,
      title,
    },
  };
}

export default function GenTokenPage() {
  return <GenContent />;
}

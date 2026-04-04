import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import NotFoundPage from '@pages/not-found/not-found-page';

const { name, description, url, cards } = metadataHelper;

export const metadata = {
  description,
  metadataBase: new URL('https://cdn.genfeed.ai'),
  openGraph: {
    description,
    images: {
      alt: 'Genfeed.ai',
      height: 836,
      type: 'image/jpeg',
      url: cards.default,
      width: 1600,
    },
    title: `Page Not Found - ${name}`,
    type: 'website',
    url,
  },
  title: `Page Not Found - ${name}`,
  twitter: {
    card: 'summary_large_image',
    creator: '@genfeedai',
    creatorId: '1928229187782848512',
    description,
    images: [cards.default],
    site: url,
    title: `Page Not Found - ${name}`,
  },
};

export default function Page() {
  return <NotFoundPage />;
}

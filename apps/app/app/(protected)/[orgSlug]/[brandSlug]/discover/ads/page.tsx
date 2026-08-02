import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Ads Intelligence');

export default function DiscoverAdsPage() {
  return <AdsResearchPageClient initialPlatform="all" />;
}

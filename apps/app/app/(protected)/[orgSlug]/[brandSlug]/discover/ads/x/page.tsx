import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('X Ads Research');

export default function DiscoverXAdsPage() {
  return <AdsResearchPageClient initialPlatform="x" />;
}

import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Google Ads Research');

export default function DiscoverGoogleAdsPage() {
  return <AdsResearchPageClient initialPlatform="google" />;
}

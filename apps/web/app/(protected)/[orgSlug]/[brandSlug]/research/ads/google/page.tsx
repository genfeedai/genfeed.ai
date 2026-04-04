import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Google Ads Research');

export default function ResearchGoogleAdsPage() {
  return <AdsResearchPageClient initialPlatform="google" />;
}

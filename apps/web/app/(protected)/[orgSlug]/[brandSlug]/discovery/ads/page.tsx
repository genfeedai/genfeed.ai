import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AdsResearchPageClient from '@/features/research/ads/AdsResearchPageClient';

export const generateMetadata = createPageMetadata('Ads Intelligence');

export default function DiscoveryAdsPage() {
  return <AdsResearchPageClient />;
}

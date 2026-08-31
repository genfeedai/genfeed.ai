import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Meta Ads Research');

export default function DiscoveryMetaAdsPage() {
  return <AdsResearchPageClient initialPlatform="meta" />;
}

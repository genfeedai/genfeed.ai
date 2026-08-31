import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('TikTok Ads Research');

export default function DiscoveryTikTokAdsPage() {
  return <AdsResearchPageClient initialPlatform="tiktok" />;
}

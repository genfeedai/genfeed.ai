import AdsResearchPageClient from '@app-components/research/ads/AdsResearchPageClient';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import XAdsDsaNotice from './x-ads-dsa-notice';

export const generateMetadata = createPageMetadata('X Ads Research');

export default function DiscoveryXAdsPage() {
  return (
    <>
      <XAdsDsaNotice />
      <AdsResearchPageClient initialPlatform="x" />
    </>
  );
}

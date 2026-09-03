import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignDetailAds, CampaignDetailShell } from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Ads');

export default async function PublishingCampaignAdsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <CampaignDetailShell campaignId={id} section="ads">
        <CampaignDetailAds campaignId={id} />
      </CampaignDetailShell>
    </Suspense>
  );
}

import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  CampaignDetailPerformance,
  CampaignDetailShell,
} from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign Performance');

export default async function PublishingCampaignPerformancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <CampaignDetailShell campaignId={id} section="performance">
        <CampaignDetailPerformance campaignId={id} />
      </CampaignDetailShell>
    </Suspense>
  );
}

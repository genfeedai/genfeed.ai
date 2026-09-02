import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignDetailOverview, CampaignDetailShell } from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Campaign');

export default async function PublishingCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <CampaignDetailShell campaignId={id} section="overview">
        <CampaignDetailOverview campaignId={id} />
      </CampaignDetailShell>
    </Suspense>
  );
}

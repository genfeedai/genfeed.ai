import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { CampaignFormPage } from '@pages/campaigns';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Edit Campaign');

export default async function PublishingCampaignEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <CampaignFormPage campaignId={id} />
    </Suspense>
  );
}

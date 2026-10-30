import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { OutreachCampaignDetail } from '@/features/agents';

export const generateMetadata = createPageMetadata('Outreach sequence');

export default function OutreachSequenceDetailRoute() {
  return (
    <Suspense fallback={null}>
      <OutreachCampaignDetail />
    </Suspense>
  );
}

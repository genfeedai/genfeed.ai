import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignDetail } from '@pages/agents';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Outreach sequence');

export default function OutreachSequenceDetailRoute() {
  return (
    <Suspense fallback={null}>
      <OutreachCampaignDetail />
    </Suspense>
  );
}

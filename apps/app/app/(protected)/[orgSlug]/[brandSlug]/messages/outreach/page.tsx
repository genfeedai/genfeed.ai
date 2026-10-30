import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { OutreachCampaignsList } from '@/features/agents';

export const generateMetadata = createPageMetadata('Outreach sequences');

export default function OutreachSequencesRoute() {
  return (
    <Suspense fallback={null}>
      <OutreachCampaignsList />
    </Suspense>
  );
}

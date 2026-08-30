import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignsList } from '@pages/agents';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Outreach sequences');

export default function OutreachSequencesRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <OutreachCampaignsList />
    </Suspense>
  );
}

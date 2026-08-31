import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignWizard } from '@pages/agents';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New outreach sequence');

export default function OutreachSequenceNewRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <OutreachCampaignWizard />
    </Suspense>
  );
}

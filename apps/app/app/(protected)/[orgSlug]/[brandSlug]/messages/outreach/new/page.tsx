import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { OutreachCampaignWizard } from '@pages/agents';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('New outreach sequence');

export default function OutreachSequenceNewRoute() {
  return (
    <Suspense fallback={null}>
      <OutreachCampaignWizard />
    </Suspense>
  );
}

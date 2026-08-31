import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AutomationOverviewPage from './AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Agents Overview');

export default function AutomateOverviewRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AutomationOverviewPage />
    </Suspense>
  );
}

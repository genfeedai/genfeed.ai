import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AutomationOverviewPage from './AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Agents Overview');

export default function AutomationOverviewRoute() {
  return (
    <Suspense fallback={null}>
      <AutomationOverviewPage />
    </Suspense>
  );
}

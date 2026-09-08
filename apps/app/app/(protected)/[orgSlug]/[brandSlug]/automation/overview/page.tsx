import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AutomationOverviewPage from './AutomationOverviewPage';

export const generateMetadata = createPageMetadata('Automation Overview');

export default function AutomationOverviewRoute() {
  return (
    <Suspense fallback={null}>
      <AutomationOverviewPage />
    </Suspense>
  );
}

import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import PublishingOverviewPage from './PublishingOverviewPage';

export const generateMetadata = createPageMetadata('Publishing Overview');

/**
 * Publishing home — module dashboard (pulse + launch cards).
 * Draft/post libraries live on Scheduled + Published; calendar on Calendar.
 */
export default function PublishingOverviewRoute() {
  return (
    <Suspense fallback={null}>
      <PublishingOverviewPage />
    </Suspense>
  );
}

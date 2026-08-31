import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsHooks from './analytics-hooks';

export const generateMetadata = createPageMetadata('Hook Performance');

export default function AnalyticsHooksPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsHooks />
    </Suspense>
  );
}

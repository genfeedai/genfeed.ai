import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BreakoutsContent from './content';

export const generateMetadata = createPageMetadata('Analytics Breakouts');

export default function AnalyticsBreakoutsPage() {
  return (
    <Suspense fallback={null}>
      <BreakoutsContent />
    </Suspense>
  );
}

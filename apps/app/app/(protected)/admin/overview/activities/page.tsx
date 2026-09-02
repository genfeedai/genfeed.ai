import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Activities');

export default function ActivitiesPage() {
  return (
    <Suspense fallback={null}>
      <LocalizedActivitiesList
        scope={PageScope.SUPERADMIN}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />
    </Suspense>
  );
}

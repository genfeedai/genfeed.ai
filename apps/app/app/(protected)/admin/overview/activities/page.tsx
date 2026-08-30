import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Activities');

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <LocalizedActivitiesList
        scope={PageScope.SUPERADMIN}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />
    </Suspense>
  );
}

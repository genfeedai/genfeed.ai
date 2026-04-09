import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ActivitiesList from '@pages/activities/activities-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Activities');

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ActivitiesList
        scope={PageScope.SUPERADMIN}
        isStatsEnabled={false}
        isFiltersEnabled={false}
      />
    </Suspense>
  );
}

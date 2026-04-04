import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ActivitiesList from '@pages/activities/list/activities-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Overview Activities');

export default function OverviewActivitiesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled
        isFiltersEnabled
      />
    </Suspense>
  );
}

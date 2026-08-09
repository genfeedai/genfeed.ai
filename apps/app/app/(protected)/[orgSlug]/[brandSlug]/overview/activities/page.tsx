import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Overview Activities');

export default function OverviewActivitiesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LocalizedActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled
        isFiltersEnabled
      />
    </Suspense>
  );
}

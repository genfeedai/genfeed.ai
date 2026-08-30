import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import LocalizedActivitiesList from '@/components/activity/LocalizedActivitiesList';

export const generateMetadata = createPageMetadata('Overview Activities');

export default function OverviewActivitiesPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <LocalizedActivitiesList
        scope={PageScope.ORGANIZATION}
        isStatsEnabled
        isFiltersEnabled
      />
    </Suspense>
  );
}

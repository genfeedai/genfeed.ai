import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CronJobsList from '@pages/agents/tasks/CronJobsList';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Cron Jobs');

export default function LabCronJobsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback />}>
      <CronJobsList />
    </Suspense>
  );
}

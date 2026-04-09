import { SkeletonLoadingFallback } from '@components/loading/skeleton/SkeletonFallbacks';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnnouncementsPage from '@protected/administration/announcements/announcements-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Announcements');

export default function AnnouncementsRoutePage() {
  return (
    <Suspense fallback={<SkeletonLoadingFallback />}>
      <AnnouncementsPage />
    </Suspense>
  );
}

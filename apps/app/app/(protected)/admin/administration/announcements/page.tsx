import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnnouncementsPage from '@protected/administration/announcements/announcements-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Announcements');

export default function AnnouncementsRoutePage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnnouncementsPage />
    </Suspense>
  );
}

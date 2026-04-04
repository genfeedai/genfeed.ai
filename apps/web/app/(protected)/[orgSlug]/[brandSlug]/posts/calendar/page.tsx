import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import CalendarPageContent from './calendar-page-content';

export const generateMetadata = createPageMetadata('Posts Calendar');

export default function PostsCalendarPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CalendarPageContent />
    </Suspense>
  );
}

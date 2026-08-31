import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import CalendarPageContent from './calendar-page-content';

export const generateMetadata = createPageMetadata('Posts Calendar');

export default function PostsCalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageContent />
    </Suspense>
  );
}

import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CalendarPageContent from './calendar-page-content';

export const generateMetadata = createPageMetadata('Calendar');

export default function PublishingCalendarPage() {
  return <CalendarPageContent embedded />;
}

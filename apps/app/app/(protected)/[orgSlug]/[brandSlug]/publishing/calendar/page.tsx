import { ViewType } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingDeskViewToggle from '@/features/posts/library/publishing-desk-view-toggle';
import CalendarPageContent from './calendar-page-content';

export const generateMetadata = createPageMetadata('Calendar');

export default function PublishingCalendarPage() {
  return (
    <>
      <PublishingDeskViewToggle activeView={ViewType.CALENDAR} />
      <CalendarPageContent embedded />
    </>
  );
}

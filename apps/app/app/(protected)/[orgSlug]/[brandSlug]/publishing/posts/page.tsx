import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';
import CalendarPageContent from '../calendar/calendar-page-content';
import ReviewQueueContent from '../review/review-queue-content';

export const generateMetadata = createPageMetadata('Posts');

export default function PublishingPostsPage() {
  return (
    <PublishingContentLibrary
      approvals={<ReviewQueueContent />}
      calendar={<CalendarPageContent embedded />}
    />
  );
}

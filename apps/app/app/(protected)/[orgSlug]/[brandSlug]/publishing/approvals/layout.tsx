import { ViewType } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingDeskViewToggle from '@pages/posts/library/publishing-desk-view-toggle';
import ReviewQueueContent from '../review/review-queue-content';

export const generateMetadata = createPageMetadata('Approvals');

/**
 * `/publishing/approvals`, `/approvals/<run>` and `/approvals/<run>/<item>`
 * share this layout, so picking a run or an item never remounts the queue. The
 * queue reads the run and item from the pathname itself; the pages below only
 * make those paths exist.
 */
export default function PublishingApprovalsLayout() {
  return (
    <>
      <PublishingDeskViewToggle activeView={ViewType.APPROVALS} />
      <ReviewQueueContent />
    </>
  );
}

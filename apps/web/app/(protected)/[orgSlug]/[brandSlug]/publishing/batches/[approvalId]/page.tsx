import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import type { ApprovalDetailPageProps } from '@/props/pages/page.props';
import PublishingApprovalContent from './publishing-approval-content';

export const generateMetadata = createPageMetadata('Scheduled posts');

// The id is read inside the boundary: awaiting it at the top of the page makes
// the whole route a request-time hole, so a prepared destination would still
// wait for the server render on click.
export default function PublishingBatchPage({
  params,
}: ApprovalDetailPageProps) {
  return (
    <Suspense fallback={null}>
      <PublishingApprovalContent params={params} />
    </Suspense>
  );
}

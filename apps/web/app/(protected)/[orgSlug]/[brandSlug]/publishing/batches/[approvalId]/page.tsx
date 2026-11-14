import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ScheduledReleaseBatchPage from '@/features/scheduled-batches/components/ScheduledReleaseBatchPage';

export const generateMetadata = createPageMetadata('Scheduled posts');

export default async function PublishingBatchPage({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;

  return (
    <Suspense fallback={null}>
      <ScheduledReleaseBatchPage approvalId={approvalId} />
    </Suspense>
  );
}

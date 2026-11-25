import ScheduledReleaseBatchPage from '@/features/scheduled-batches/components/ScheduledReleaseBatchPage';
import type { ApprovalDetailPageProps } from '@/props/pages/page.props';

export default async function PublishingApprovalContent({
  params,
}: ApprovalDetailPageProps) {
  const { approvalId } = await params;

  return <ScheduledReleaseBatchPage approvalId={approvalId} />;
}

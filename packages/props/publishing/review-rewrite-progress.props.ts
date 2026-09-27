import type { IBatchRewriteJob } from '@genfeedai/contracts/interfaces';

export interface ReviewRewriteProgressProps {
  isCancelling: boolean;
  job: IBatchRewriteJob;
  onCancel: () => void;
}

export interface UseBatchRewriteJobParams {
  readonly batchId: string | null;
  /** Called whenever rewritten captions land, so the page can refetch rows. */
  readonly onItemsRewritten: () => void | Promise<void>;
}

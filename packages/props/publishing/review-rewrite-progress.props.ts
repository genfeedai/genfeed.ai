import type { ITurboRewriteJob } from '@genfeedai/contracts/interfaces';

export interface ReviewRewriteProgressProps {
  isCancelling: boolean;
  job: ITurboRewriteJob;
  onCancel: () => void;
}

export interface UseTurboRewriteJobParams {
  readonly turboRunId: string | null;
  /** Called whenever rewritten captions land, so the page can refetch rows. */
  readonly onItemsRewritten: () => void | Promise<void>;
}

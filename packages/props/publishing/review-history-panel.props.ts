import type { IBatchItem } from '@genfeedai/contracts/interfaces';

export type ReviewEvent = NonNullable<IBatchItem['reviewEvents']>[number];

export interface ReviewHistoryPanelProps {
  browserTimezone: string;
  reviewEvents: ReviewEvent[];
}

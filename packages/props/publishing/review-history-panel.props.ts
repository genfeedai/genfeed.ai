import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';

export type ReviewEvent = NonNullable<ITurboRunItem['reviewEvents']>[number];

export interface ReviewHistoryPanelProps {
  browserTimezone: string;
  reviewEvents: ReviewEvent[];
}

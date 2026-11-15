import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';

type ReviewEvent = NonNullable<ITurboRunItem['reviewEvents']>[number];

export interface ReviewHistoryPanelProps {
  browserTimezone: string;
  reviewEvents: ReviewEvent[];
}

import type { IXActivityApproval } from '@genfeedai/contracts/interfaces';

export interface XFollowerSnapshotInput {
  date: Date;
  followers: number | null;
  metricAvailability: unknown;
}

/** What the post itself records, which the publication insight does not. */
export interface XPostFacts {
  approval: IXActivityApproval | null;
  isQuote: boolean;
}

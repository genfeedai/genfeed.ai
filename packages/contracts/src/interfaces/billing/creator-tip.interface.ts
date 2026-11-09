/** A reader's tip to a creator, paid from the reader's organization credits. */
export interface ICreatorTipRequest {
  /** Whole credits to send. */
  amount: number;
  /** Article the tip was sent from, when it was. */
  articleId?: string;
  /** The creator's public profile handle (brand slug). */
  handle: string;
  /** Client-generated key so a double click or retry sends one tip. */
  idempotencyKey: string;
  /** Optional note shown to the creator. */
  message?: string;
}

export interface ICreatorTipResult {
  amount: number;
  /** The reader's spendable balance after the tip. */
  balanceAfter: number;
  creatorLabel: string;
  transferId: string;
  /** False when the idempotency key matched a tip already sent. */
  wasApplied: boolean;
}

/** The creator a tip page shows before the reader pays. */
export interface ICreatorTipTarget {
  brandId: string;
  handle: string;
  label: string;
  /** False when the reader belongs to the creator's organization. */
  isTippable: boolean;
}

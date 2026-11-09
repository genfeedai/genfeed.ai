import type { CreditTransferKind } from '../../enums/credit.enum';

/**
 * One creator payment as one side of the ledger sees it (#9719). The amounts
 * come from the ledger row's metadata: gross is what the reader paid, the fee
 * is the platform's cut, net is what the creator received.
 */
export interface ICreatorPaymentRow {
  createdAt: string;
  /** "Tip from Ada on …" on the creator's side, "Tip to …" on the reader's. */
  description: string;
  feeAmount: number;
  grossAmount: number;
  kind: CreditTransferKind;
  message?: string;
  netAmount: number;
  transferId: string;
}

export interface ICreatorEarningsBySource {
  count: number;
  kind: CreditTransferKind;
  netAmount: number;
}

export interface ICreatorEarningsByArticle {
  articleId: string;
  count: number;
  label: string;
  netAmount: number;
}

/** The Earnings page: what the organization earned, and what it paid. */
export interface ICreatorEarnings {
  byArticle: ICreatorEarningsByArticle[];
  bySource: ICreatorEarningsBySource[];
  /** Earned credits still in the wallet (spends use purchased credits first). */
  earnedBalance: number;
  /** Net credits received since the start of the current UTC month. */
  thisMonth: number;
  /** Net credits received, all time. */
  totalEarned: number;
  received: ICreatorPaymentRow[];
  sent: ICreatorPaymentRow[];
}

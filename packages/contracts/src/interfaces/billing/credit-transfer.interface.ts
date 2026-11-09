import type { CreditTransferKind } from '../../enums/credit.enum';

/** One payment of credits from a payer organization to a creator organization. */
export interface ICreditTransferInput {
  /** Gross credits the payer sends. Positive whole number. */
  amount: number;
  /**
   * Caller-chosen key. A retry with the same key and payer returns the first
   * transfer instead of moving credits again.
   */
  idempotencyKey: string;
  kind: CreditTransferKind;
  /** Short note from the payer to the creator (tips). */
  message?: string;
  /** Brand the creator was paid through; attributed on the creator's row. */
  payeeBrandId?: string;
  /** The creator's ledger row description, e.g. "Tip from Ada on My article". */
  payeeDescription?: string;
  payeeOrganizationId: string;
  /** The payer's ledger row description, e.g. "Tip to Bea on My article". */
  payerDescription?: string;
  payerOrganizationId: string;
  payerUserId: string;
  /** What was paid for: article id, creator subscription id, profile brand id. */
  subjectId?: string;
}

export interface ICreditTransferResult {
  feeAmount: number;
  grossAmount: number;
  kind: CreditTransferKind;
  netAmount: number;
  payeeOrganizationId: string;
  payerBalanceAfter: number;
  payerOrganizationId: string;
  /** Shared `referenceId` of the payer and creator ledger rows. */
  transferId: string;
  /** False when the idempotency key matched an earlier transfer. */
  wasApplied: boolean;
}

/** Metadata both ledger rows of a creator payment carry. */
export interface ICreditTransferLedgerMetadata {
  counterpartyOrganizationId: string;
  feeAmount: number;
  grossAmount: number;
  kind: CreditTransferKind;
  message?: string;
  netAmount: number;
  payeeBrandId?: string;
  payerUserId: string;
  subjectId?: string;
  transferId: string;
}

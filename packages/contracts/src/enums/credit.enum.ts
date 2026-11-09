export enum CreditTransactionCategory {
  ADD = 'add',
  DEDUCT = 'deduct',
  EXPIRE = 'expire',
  RESET = 'reset',
  ROLLOVER = 'rollover',
  REFUND = 'refund',
  BYOK_USAGE = 'byok-usage',
  /** Credits a payer sent to another organization (tip, creator subscription, unlock). */
  TRANSFER_OUT = 'transfer-out',
  /** Credits an organization received from another organization's transfer. */
  TRANSFER_IN = 'transfer-in',
}

/** What a creator payment paid for. Stored as the ledger row's `source`. */
export enum CreditTransferKind {
  TIP = 'tip',
  SUBSCRIPTION = 'subscription',
  UNLOCK = 'unlock',
}

export enum CreditEntityModel {
  ORGANIZATION = 'Organization',
  USER = 'User',
}

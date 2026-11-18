import type { ModelPricingRateChange } from '../billing/model-pricing.interface';

/** Providers whose registry rows the model scanner refreshes. */
export type ModelScanProvider = 'replicate' | 'fal' | 'higgsfield';

/**
 * A provider changed a price. The approved rate keeps charging until an
 * operator approves the pending one.
 */
export interface ModelScanPriceChange {
  changes: ModelPricingRateChange[];
  /**
   * True when the pending rate puts the provider cost above what we charge, so
   * every run at the new rate loses money. Cards lead with these.
   */
  isUrgent: boolean;
  modelKey: string;
  /** Why it is urgent, for example "provider cost $0.08 exceeds sell price $0.06". */
  urgentReason: string | null;
  pendingRateHash: string;
  sourceUrl: string | null;
}

/**
 * The provider's public price page is gone (404) but its API still serves the
 * model. The approved rate keeps charging; there is no public price left to
 * watch. Reported once.
 */
export interface ModelScanDelistedModel {
  modelKey: string;
  /** Human-readable evidence, for example "model page returned 404". */
  reason: string;
  sourceUrl: string | null;
}

/**
 * The provider's API says the model no longer exists (404). Reported once; the
 * scanner never retires a row. An operator retires it.
 */
export interface ModelScanRemovedModel {
  modelKey: string;
  /** Human-readable evidence, for example "API returned 404". */
  reason: string;
  sourceUrl: string | null;
}

/** A model the scanner drafted this run. Drafts are always inactive. */
export interface ModelScanNewDraft {
  /** Billing unit read from the provider page; null when no rate was readable. */
  billingUnit: string | null;
  category: string;
  modelKey: string;
  /** Provider list price in USD per billing unit; null when none was readable. */
  providerCostUsd: number | null;
  sourceUrl: string | null;
  /** Why the draft is stored unpriced; null when a rate was read. */
  unpricedReason: string | null;
}

/** A model whose price could not be read this run. */
export interface ModelScanUnreadableModel {
  /** Sync failure code, for example `rates_unavailable:unmapped_metric:gpu_seconds`. */
  code: string;
  modelKey: string;
  reason: string;
}

/** A registry row that cannot be scanned because the row itself is wrong. */
export interface ModelScanDataError {
  modelKey: string;
  reason: string;
}

/** Counters for one scan run. */
export interface ModelScanTotals {
  /** Pending rates that differ from the reviewed ones. */
  drifted: number;
  /** Drafts created. */
  draftsCreated: number;
  /** Provider calls or rows that failed outright. */
  errors: number;
  newModelsFound: number;
  polled: number;
  /** Rows quarantined for unsupported schema or pricing. */
  quarantined: number;
  synchronized: number;
}

/**
 * What one scanner run found, grouped by what an operator has to do. Rows that
 * need nothing, and rows already known to be unavailable, are left out.
 */
export interface ModelScanReport {
  dataErrors: ModelScanDataError[];
  delisted: ModelScanDelistedModel[];
  newDrafts: ModelScanNewDraft[];
  priceChanges: ModelScanPriceChange[];
  provider: ModelScanProvider;
  removedByProvider: ModelScanRemovedModel[];
  /** ISO 8601 time the run started. */
  startedAt: string;
  totals: ModelScanTotals;
  unreadable: ModelScanUnreadableModel[];
}

import type {
  NormalizedPaidCreativeRecord,
  PaidCreativePlatform,
  PaidCreativeProvider,
} from '@genfeedai/integrations/ads';

/**
 * Why a transparency source cannot be polled right now. Every value is a
 * stable machine code: it is persisted on the watched advertiser row and
 * surfaced to the operator, so it must never carry provider prose.
 */
export type PaidCreativeReadinessBlocker =
  | 'google_ads_transparency_contract_fixtures_missing'
  | 'paid_creative_apify_token_missing'
  | 'x_ads_repository_commercial_use_not_approved'
  | 'x_ads_repository_contract_fixtures_missing'
  | 'x_ads_repository_entitlement_not_confirmed';

/**
 * Why one ingestion attempt produced no fresh snapshot. Readiness blockers are
 * a subset: a source can be perfectly reachable and still fail this run.
 */
export type PaidCreativeIngestionErrorCode =
  | PaidCreativeReadinessBlocker
  | 'paid_creative_platform_unsupported'
  | 'paid_creative_snapshot_write_failed'
  | 'paid_creative_source_unavailable';

export interface PaidCreativeReadiness {
  available: boolean;
  blockers: PaidCreativeReadinessBlocker[];
  documentationUrl: string;
  status: 'available' | 'unavailable';
}

export interface PaidCreativeFetchRequest {
  /** ISO country codes to scope the archive query to, when it supports them. */
  countries?: string[];
  limit: number;
  /** Advertiser handle, page slug, or platform-native advertiser id. */
  query: string;
}

/**
 * One transparency archive behind one platform. Adapters never persist and
 * never decide tenancy — they translate a query into normalized records, or
 * report exactly why they cannot.
 */
export interface PaidCreativeProviderAdapter {
  fetchCreatives(
    request: PaidCreativeFetchRequest,
  ): Promise<NormalizedPaidCreativeRecord[]>;
  getReadiness(): PaidCreativeReadiness;
  readonly provider: PaidCreativeProvider;
}

export interface PaidCreativeIngestionResult {
  advertiserId: string;
  errorCode?: PaidCreativeIngestionErrorCode;
  /**
   * The watched row's platform as persisted. Deliberately not narrowed to
   * `PaidCreativePlatform`: a row can carry a value this build no longer
   * supports, and the operator needs to see which one it was.
   */
  platform: string;
  recordCount: number;
  status: 'success' | 'error' | 'unavailable';
}

export interface PaidCreativePlatformReadiness extends PaidCreativeReadiness {
  platform: PaidCreativePlatform;
  provider: PaidCreativeProvider;
}

export type XAdsRepositoryReadinessBlocker =
  | 'x_ads_repository_entitlement_not_confirmed'
  | 'x_ads_repository_commercial_use_not_approved'
  | 'x_ads_repository_contract_fixtures_missing';

export interface XAdsRepositoryReadiness {
  available: false;
  blockers: XAdsRepositoryReadinessBlocker[];
  documentationUrl: string;
  status: 'unavailable';
}

export interface XAdsRepositoryIngestionResult {
  advertiserId: string;
  errorCode?: string;
  recordCount: number;
  status: 'success' | 'error' | 'unavailable';
}

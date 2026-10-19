export type ReferenceDataDomainName =
  | 'font-families'
  | 'models'
  | 'platform-templates'
  | 'rates'
  | 'skills'
  | 'studio-presets'
  | 'studio-elements';

export type ReferenceDataDomainSummary = {
  domain: ReferenceDataDomainName;
  failed: string[];
  unchanged: number;
  written: number;
};

export type ReferenceDataSyncReport = {
  domains: ReferenceDataDomainSummary[];
  failedDomains: ReferenceDataDomainName[];
};

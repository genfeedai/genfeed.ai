export interface ICostReportQuery {
  brandId?: string;
  from?: string;
  to?: string;
}

export interface ICostReportEntriesQuery extends ICostReportQuery {
  limit?: number;
  skip?: number;
}

export interface ICostReportTotals {
  byokCount: number;
  creditsUsed: number;
  generationCount: number;
  llmCount: number;
  mediaCount: number;
  providerCostMicros: number;
  providerCostUsd: number;
}

export interface ICostReportBrandTotals extends ICostReportTotals {
  brandId: string | null;
  brandLabel: string;
}

export interface ICostReportDailyTotals {
  byokCount: number;
  creditsUsed: number;
  date: string;
  generationCount: number;
  providerCostMicros: number;
  providerCostUsd: number;
}

export interface ICostReportSummary {
  byBrand: ICostReportBrandTotals[];
  daily: ICostReportDailyTotals[];
  from: string;
  to: string;
  total: ICostReportTotals;
}

export type CostReportEntryType = 'credit' | 'llm' | 'media';

export interface ICostReportEntry {
  brandId: string | null;
  brandLabel: string;
  category: string | null;
  createdAt: string;
  creditsUsed: number;
  entryType: CostReportEntryType;
  id: string;
  isByok: boolean;
  model: string | null;
  provider: string | null;
  providerCostMicros: number;
  providerCostUsd: number;
  referenceId: string | null;
}

export interface ICostReportEntries {
  docs: ICostReportEntry[];
  limit: number;
  skip: number;
  total: number;
}

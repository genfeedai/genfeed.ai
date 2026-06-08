export interface AnalyticsSyncJobData {
  organizationId: string;
  brandId?: string;
  /** ISO date string - only sync analytics newer than this */
  since?: string;
  /** Whether to auto-detect last sync date for incremental sync */
  incremental?: boolean;
}

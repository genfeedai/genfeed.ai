/** The libraries a scan reads from: niche trends, and competitor ads. */
export type ResearchScanLibrary = 'trends' | 'ads';

/** How many scans a library allows in a rolling window. */
export interface ResearchScanLimitWindow {
  maxScans: number;
  windowMs: number;
}

/**
 * Where one library stands for the organization: what is left and when the
 * next scan opens. Reading it starts no run and counts as no scan.
 */
export interface ResearchScanStatus {
  /** Whether the organization is on a plan. */
  hasPlan: boolean;
  library: ResearchScanLibrary;
  /** Null: no limit. */
  limit: ResearchScanLimitWindow | null;
  /** ISO time the next scan opens. Null while a scan is available. */
  nextAvailableAt: string | null;
  /** Null: no limit. */
  remaining: number | null;
  used: number;
}

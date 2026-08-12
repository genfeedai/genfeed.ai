export interface PatternExtractionJobData {
  /**
   * Ignored. The daily job scans once and derives every platform.
   * Optional so in-flight per-platform jobs stay valid.
   */
  platform?: string;
}

/**
 * Post-scoring report analyzers. They read what a run already scored — no
 * provider calls — and run on partial (spend-aborted) outcomes too. The
 * outlier report (#5234) registers here.
 */

import type { ReportAnalyzer } from './contracts';

export const REPORT_ANALYZERS: ReportAnalyzer[] = [];

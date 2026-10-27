/**
 * Post-scoring report analyzers. They read what a run already scored — no
 * provider calls — and run on partial (spend-aborted) outcomes too. The
 * outlier report (#5234) and the noise report (#5600) register here.
 */

import type { ReportAnalyzer } from './contracts';
import { noiseReportAnalyzer } from './noise';
import { outlierReportAnalyzer } from './outliers';

export const REPORT_ANALYZERS: ReportAnalyzer[] = [
  outlierReportAnalyzer,
  noiseReportAnalyzer,
];

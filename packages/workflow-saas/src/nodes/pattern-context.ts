import type { ICreativePattern } from '@cloud/interfaces';
import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Pattern Context Node Data
 *
 * Retrieves proven creative patterns for a brand from performance data
 * and makes them available to downstream workflow nodes.
 *
 * Outputs:
 * - patterns (object): Array of creative patterns matched to the brand
 */
export interface PatternContextNodeData extends BaseNodeData {
  // Configuration
  brandId: string | null;
  patternTypes: string[];
  limit: number;

  // Resolved at execution time
  patterns: ICreativePattern[];

  // Job state
  jobId: string | null;
}

/**
 * Default data for a new Pattern Context node
 */
export const DEFAULT_PATTERN_CONTEXT_DATA: Partial<PatternContextNodeData> = {
  brandId: null,
  jobId: null,
  label: 'Pattern Context',
  limit: 10,
  patterns: [],
  patternTypes: [],
  status: 'idle',
};

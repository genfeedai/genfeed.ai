import { ModelKey } from '@genfeedai/enums';

/**
 * Configuration for Mongoose population (joins).
 * Used across all services that need to populate related documents.
 */
export interface PopulateOption {
  path: string;
  select?: string;
  model?: ModelKey;
  populate?: PopulateOption;
}

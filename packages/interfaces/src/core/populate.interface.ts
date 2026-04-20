/**
 * Configuration for relation population / nested fetches.
 * Used across services that need to load related documents.
 */
export interface PopulateOption {
  path: string;
  select?: string;
  model?: string;
  populate?: PopulateOption;
}

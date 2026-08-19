export const AB_TEST_SUGGESTION_SOURCE = 'ab-test-suggestion';
export const AB_TEST_OUTCOME_ENTRY_TYPE = 'ab_test_outcome';

export interface AbTestSuggestionInput {
  hypothesis: string;
  platform: string;
  suggestionId?: string;
  variable: string;
  variantA: string;
  variantB: string;
}

export interface ExecuteAbTestSuggestionParams {
  brandId: string;
  organizationId: string;
  suggestion: AbTestSuggestionInput;
  userId: string;
}

export interface ExecuteAbTestSuggestionResult {
  armCount: number;
  groupId: string;
  postIds: string[];
  suggestionId: string;
}

export type AbTestOutcomeStatus = 'resolved' | 'insufficient_evidence';

export interface AbTestOutcome {
  groupId: string;
  status: AbTestOutcomeStatus;
  suggestionId: string;
  winnerPostId?: string;
  winnerVariantId?: string;
}

export interface BrandMemoryOutcomeEntry {
  content?: string;
  metadata?: {
    groupId?: string;
    status?: string;
    suggestionId?: string;
    winnerPostId?: string;
    winnerVariantId?: string;
  };
  type?: string;
}

export interface BrandMemoryOutcomeRow {
  entries?: BrandMemoryOutcomeEntry[];
}

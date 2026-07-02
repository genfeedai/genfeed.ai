export interface AdInsightsAggregationJobData {
  aggregationWindow?: string;
  idempotencyKey?: string;
  insightTypes: string[];
  industries?: string[];
  scope: 'platform';
  sourceIssue?: number;
}

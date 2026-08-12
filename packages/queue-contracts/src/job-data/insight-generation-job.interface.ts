/**
 * Background insight fill scheduled when GET /insights is short of the
 * requested unread/active window. One job per organization (job id
 * `insight-generate:${organizationId}`) so a refresh storm cannot fan out
 * duplicate LLM calls.
 */
export const INSIGHT_GENERATION_JOB_NAME = 'generate-insights';

export interface InsightGenerationJobData {
  organizationId: string;
  limit: number;
}

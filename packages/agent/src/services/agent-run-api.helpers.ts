import type {
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';

export interface ListAgentRunsParams {
  brandId?: string;
  limit?: number;
  page?: number;
  status?: string;
}

export function buildAgentRunsQuery(params: ListAgentRunsParams): string {
  const entries = [
    ['limit', String(params.limit ?? 10)],
    ['page', String(params.page ?? 1)],
    ['brand', params.brandId],
    ['status', params.status],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return new URLSearchParams(entries).toString();
}

export function buildAgentRunBrandQuery(brandId?: string): string {
  return brandId
    ? `?${new URLSearchParams({ brand: brandId }).toString()}`
    : '';
}

function createFallbackAgentRunPagination(
  runs: AgentRunSummary[],
  params: ListAgentRunsParams,
): AgentRunPage['pagination'] {
  const limit = params.limit ?? 10;
  const page = params.page ?? 1;
  return {
    limit,
    page,
    pages: runs.length === 0 && page === 1 ? 0 : page,
    total: (page - 1) * limit + runs.length,
  };
}

export function createAgentRunPage(
  document: JsonApiResponseDocument,
  runs: AgentRunSummary[],
  params: ListAgentRunsParams,
): AgentRunPage {
  return {
    pagination:
      document.links?.pagination ??
      createFallbackAgentRunPagination(runs, params),
    runs,
  };
}

import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type {
  ContextCoverage,
  ContextCoverageUsage,
} from '@genfeedai/contracts/interfaces';

export interface GetContextCoverageParams {
  /** The thread's brand; omitted for a thread without one (organization and personal lanes only). */
  brandId?: string;
  usage?: ContextCoverageUsage;
}

interface ContextCoverageToolResponse {
  data?: ContextCoverage;
  error?: string;
  success: boolean;
}

/**
 * Reads coverage through the same `get_context_coverage` action the agent and
 * MCP call, so the panel can never disagree with the tool. Scope is derived on
 * the server; the brand id is only a request the server authorizes.
 */
export async function getContextCoverage(
  api: AgentBaseApiService,
  params: GetContextCoverageParams,
  signal?: AbortSignal,
): Promise<ContextCoverage> {
  const response = await api.fetchJson<ContextCoverageToolResponse>(
    `${api.config.baseUrl}/agent-tools/get_context_coverage/execute`,
    {
      body: JSON.stringify({
        ...(params.brandId ? { context: { brandId: params.brandId } } : {}),
        parameters: { usage: params.usage ?? 'search' },
      }),
      method: 'POST',
      signal,
    },
    'Failed to load context coverage',
  );
  if (!response.success || !response.data) {
    throw new Error('Context coverage is unavailable');
  }
  return response.data;
}

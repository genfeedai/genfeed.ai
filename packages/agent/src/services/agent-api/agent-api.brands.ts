import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import type { IBrandInterviewCompleteness } from '@genfeedai/contracts/interfaces';

/** Brand context score plus onboarding card progress for one brand. */
export async function getBrandCompleteness(
  api: AgentBaseApiService,
  brandId: string,
  signal?: AbortSignal,
): Promise<IBrandInterviewCompleteness> {
  return api.fetchJson<IBrandInterviewCompleteness>(
    `${api.config.baseUrl}/brands/${encodeURIComponent(brandId)}/completeness`,
    { signal },
    'Failed to fetch brand context',
  );
}

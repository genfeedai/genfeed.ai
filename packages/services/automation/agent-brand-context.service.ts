import type { IAgentBrandContextSnapshot } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/**
 * What the agent knows about a brand (`GET brands/:brandId/agent-context`,
 * see `apps/server/api/src/services/agent-orchestrator/agent-brand-context.controller.ts`).
 */
export class AgentBrandContextService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): AgentBrandContextService {
    return HTTPBaseService.getBaseServiceInstance(
      AgentBrandContextService,
      token,
    ) as AgentBrandContextService;
  }

  async getSnapshot(
    brandId: string,
    options: { query?: string; signal?: AbortSignal } = {},
  ): Promise<IAgentBrandContextSnapshot> {
    const query = options.query?.trim();
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/brands/${brandId}/agent-context`,
      {
        params: query ? { query } : undefined,
        signal: options.signal,
      },
    );
    return deserializeResource<IAgentBrandContextSnapshot>(response.data);
  }
}

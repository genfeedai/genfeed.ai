import type { IAgentCreditsInfo } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/** GET /agent/credits — balance, free-tier model lock, per-message estimates. */
export class AgentCreditsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/agent/credits`, token);
  }

  public static getInstance(token: string): AgentCreditsService {
    return HTTPBaseService.getBaseServiceInstance(
      AgentCreditsService,
      token,
    ) as AgentCreditsService;
  }

  async getCreditsInfo(signal?: AbortSignal): Promise<IAgentCreditsInfo> {
    const response = await this.instance.get<IAgentCreditsInfo>('', {
      signal,
    });
    return response.data;
  }
}

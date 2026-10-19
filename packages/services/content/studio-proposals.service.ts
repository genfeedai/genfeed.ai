import type {
  StudioProposalSurface,
  StudioProposalsResult,
} from '@genfeedai/contracts/api-types/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/**
 * Agent-written Studio drafts (`brands/:brandId/content/studio-proposals`,
 * see `apps/server/api/src/services/content-engine/content-engine.controller.ts`).
 */
export class StudioProposalsService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): StudioProposalsService {
    return HTTPBaseService.getBaseServiceInstance(
      StudioProposalsService,
      token,
    ) as StudioProposalsService;
  }

  async propose(
    brandId: string,
    surface: StudioProposalSurface,
    options: { count?: number; signal?: AbortSignal } = {},
  ): Promise<StudioProposalsResult> {
    const response = await this.instance.post<StudioProposalsResult>(
      `/brands/${brandId}/content/studio-proposals`,
      { count: options.count, surface },
      { signal: options.signal },
    );
    return response.data;
  }
}

import type {
  IAiActionRequest,
  IAiActionResponse,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export class AiActionsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/organizations`, token);
  }

  static getInstance(token: string): AiActionsService {
    return HTTPBaseService.getBaseServiceInstance(
      AiActionsService,
      token,
    ) as AiActionsService;
  }

  async execute(
    orgId: string,
    request: IAiActionRequest,
  ): Promise<IAiActionResponse> {
    const response = await this.instance.post<IAiActionResponse>(
      `/${orgId}/ai-actions/execute`,
      request,
    );
    return response.data;
  }
}

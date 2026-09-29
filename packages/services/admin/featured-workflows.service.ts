import type {
  IFeaturedWorkflowPinsResponse,
  IFeaturedWorkflowSummary,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/**
 * Superadmin curation of the templates page Featured row (#5511). Every
 * write answers with the pins as stored after it, in order.
 */
export class AdminFeaturedWorkflowsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/featured-workflows`, token);
  }

  public static getInstance(token: string): AdminFeaturedWorkflowsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminFeaturedWorkflowsService,
      token,
    ) as AdminFeaturedWorkflowsService;
  }

  async list(signal?: AbortSignal): Promise<IFeaturedWorkflowSummary[]> {
    const response = await this.instance.get<IFeaturedWorkflowPinsResponse>(
      '',
      { signal },
    );
    return response.data.data;
  }

  async pin(workflowId: string): Promise<IFeaturedWorkflowSummary[]> {
    const response = await this.instance.put<IFeaturedWorkflowPinsResponse>(
      `/${encodeURIComponent(workflowId)}`,
    );
    return response.data.data;
  }

  async unpin(workflowId: string): Promise<IFeaturedWorkflowSummary[]> {
    const response = await this.instance.delete<IFeaturedWorkflowPinsResponse>(
      `/${encodeURIComponent(workflowId)}`,
    );
    return response.data.data;
  }

  async reorder(
    workflowIds: readonly string[],
  ): Promise<IFeaturedWorkflowSummary[]> {
    const response = await this.instance.put<IFeaturedWorkflowPinsResponse>(
      '/order',
      { workflowIds },
    );
    return response.data.data;
  }
}

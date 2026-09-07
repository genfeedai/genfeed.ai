import type {
  IContentPlan,
  IContentPlanItem,
  IContentPlanSeedPreview,
  IGenerateContentPlanInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface ContentPlanWithItems {
  plan: IContentPlan;
  items: IContentPlanItem[];
}

/**
 * Brand-nested content plan endpoints (`brands/:brandId/content/plans`,
 * see `apps/server/api/src/services/content-engine/content-engine.controller.ts`).
 * Follows the manual-path pattern used by `ContentRunsService` rather than
 * `BaseService`, since every route is scoped under a brand id segment.
 */
export class ContentPlansService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): ContentPlansService {
    return HTTPBaseService.getBaseServiceInstance(
      ContentPlansService,
      token,
    ) as ContentPlansService;
  }

  async list(brandId: string, signal?: AbortSignal): Promise<IContentPlan[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/brands/${brandId}/content/plans`,
      { signal },
    );

    return deserializeCollection<IContentPlan>(response.data);
  }

  async get(
    brandId: string,
    planId: string,
    signal?: AbortSignal,
  ): Promise<ContentPlanWithItems> {
    const response = await this.instance.get<{
      items: JsonApiResponseDocument;
      plan: JsonApiResponseDocument;
    }>(`/brands/${brandId}/content/plans/${planId}`, { signal });

    return {
      items: deserializeCollection<IContentPlanItem>(response.data.items),
      plan: deserializeResource<IContentPlan>(response.data.plan),
    };
  }

  async generate(
    brandId: string,
    input: IGenerateContentPlanInput,
  ): Promise<ContentPlanWithItems> {
    const response = await this.instance.post<{
      items: JsonApiResponseDocument;
      plan: JsonApiResponseDocument;
    }>(`/brands/${brandId}/content/plans`, input);

    return {
      items: deserializeCollection<IContentPlanItem>(response.data.items),
      plan: deserializeResource<IContentPlan>(response.data.plan),
    };
  }

  /**
   * Cold-start seed-selection preview (#4511 Lane F). Returned as a plain
   * object by `ContentEngineController.getPlanSeeds`, not a JSON:API
   * document, so no deserialization is needed.
   */
  async getSeeds(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IContentPlanSeedPreview> {
    const response = await this.instance.get<IContentPlanSeedPreview>(
      `/brands/${brandId}/content/plans/seeds`,
      { signal },
    );

    return response.data;
  }
}

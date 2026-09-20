import type {
  ExpertFirstSystemItemAction,
  IContentPlan,
  IContentPlanItem,
  IContentPlanProvenance,
  IExpertPathStatus,
  IExpertPositioningScore,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/** Plan generation runs an LLM pass; it needs more than the shared ceiling. */
const FIRST_SYSTEM_TIMEOUT_MS = 180_000;

export interface ExpertFirstSystemPlan {
  items: IContentPlanItem[];
  plan: IContentPlan;
  provenance?: IContentPlanProvenance;
}

export interface ExpertFirstSystemItemReview {
  action: ExpertFirstSystemItemAction;
  prompt?: string;
  topic?: string;
}

/**
 * Expert Path endpoints (`brands/:brandId/expert-path`, see
 * `apps/server/api/src/services/expert-path/expert-path.controller.ts`).
 */
export class ExpertPathService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): ExpertPathService {
    return HTTPBaseService.getBaseServiceInstance(
      ExpertPathService,
      token,
    ) as ExpertPathService;
  }

  async getStatus(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<IExpertPathStatus> {
    const response = await this.instance.get<IExpertPathStatus>(
      `/brands/${brandId}/expert-path`,
      { signal },
    );
    return response.data;
  }

  async regeneratePositioning(
    brandId: string,
  ): Promise<{ harnessProfileId: string; score: IExpertPositioningScore }> {
    const response = await this.instance.post<{
      harnessProfileId: string;
      score: IExpertPositioningScore;
    }>(`/brands/${brandId}/expert-path/positioning/profile`, {});
    return response.data;
  }

  async generateFirstSystem(brandId: string): Promise<ExpertFirstSystemPlan> {
    const response = await this.instance.post<{
      items: JsonApiResponseDocument;
      plan: JsonApiResponseDocument;
      provenance: IContentPlanProvenance;
    }>(
      `/brands/${brandId}/expert-path/first-system`,
      {},
      // Planning runs a model call for a week of content; the shared 30s
      // ceiling would abort a request the server then completes anyway.
      { timeout: FIRST_SYSTEM_TIMEOUT_MS },
    );

    return {
      items: deserializeCollection<IContentPlanItem>(response.data.items),
      plan: deserializeResource<IContentPlan>(response.data.plan),
      provenance: response.data.provenance,
    };
  }

  async getFirstSystem(
    brandId: string,
    signal?: AbortSignal,
  ): Promise<ExpertFirstSystemPlan | null> {
    const response = await this.instance.get<{
      items: JsonApiResponseDocument | null;
      plan: JsonApiResponseDocument | null;
    }>(`/brands/${brandId}/expert-path/first-system`, { signal });

    if (!response.data.plan || !response.data.items) {
      return null;
    }

    const plan = deserializeResource<IContentPlan>(response.data.plan);
    return {
      items: deserializeCollection<IContentPlanItem>(response.data.items),
      plan,
      ...(plan.provenance ? { provenance: plan.provenance } : {}),
    };
  }

  async reviewFirstSystemItem(
    brandId: string,
    planId: string,
    itemId: string,
    review: ExpertFirstSystemItemReview,
  ): Promise<IContentPlanItem> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/brands/${brandId}/expert-path/first-system/${planId}/items/${itemId}`,
      review,
    );
    return deserializeResource<IContentPlanItem>(response.data);
  }
}

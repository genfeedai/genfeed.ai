import type { IBrandMemoryInsight } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/**
 * Distilled brand performance memory (`brands/:brandId/memory`, see
 * `apps/server/api/src/collections/brand-memory/controllers/brand-memory.controller.ts`).
 */
export class BrandMemoryService extends HTTPBaseService {
  constructor(token: string) {
    super(EnvironmentService.apiEndpoint, token);
  }

  static getInstance(token: string): BrandMemoryService {
    return HTTPBaseService.getBaseServiceInstance(
      BrandMemoryService,
      token,
    ) as BrandMemoryService;
  }

  /** Newest-first performance insights the agent's brand memory layer reads. */
  async getInsights(
    brandId: string,
    options: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<IBrandMemoryInsight[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/brands/${brandId}/memory/insights`,
      {
        params: options.limit ? { limit: options.limit } : undefined,
        signal: options.signal,
      },
    );
    return deserializeCollection<IBrandMemoryInsight>(response.data);
  }
}

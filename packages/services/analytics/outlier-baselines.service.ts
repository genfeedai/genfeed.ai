import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  OutlierPerformanceResponse,
  OutlierRankedPostsQuery,
  OutlierSnapshotResponse,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface OutlierRankedPostsPage {
  docs: OutlierPerformanceResponse[];
  limit: number;
  page: number;
  total: number;
}

export class OutlierBaselinesService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.OUTLIER_BASELINES}`,
      token,
    );
  }

  public static getInstance(token: string): OutlierBaselinesService {
    return HTTPBaseService.getBaseServiceInstance(
      OutlierBaselinesService,
      token,
    ) as OutlierBaselinesService;
  }

  public async listPosts(
    params: OutlierRankedPostsQuery,
    signal?: AbortSignal,
  ): Promise<OutlierRankedPostsPage> {
    const response = await this.instance.get<JsonApiResponseDocument>('posts', {
      params,
      signal,
    });
    const docs = deserializeCollection<OutlierPerformanceResponse>(
      response.data,
    );
    const pagination = response.data.links?.pagination;
    return {
      docs,
      limit: pagination?.limit ?? params.limit ?? 20,
      page: pagination?.page ?? params.page ?? 1,
      total: pagination?.total ?? docs.length,
    };
  }

  public async getSnapshot(
    id: string,
    signal?: AbortSignal,
  ): Promise<OutlierSnapshotResponse> {
    const response = await this.instance.get<JsonApiResponseDocument>(id, {
      signal,
    });
    return deserializeResource<OutlierSnapshotResponse>(response.data);
  }

  public async listSnapshotPosts(
    id: string,
    params: { page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<OutlierPerformanceResponse[]> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `${id}/posts`,
      { params, signal },
    );
    return deserializeCollection<OutlierPerformanceResponse>(response.data);
  }
}

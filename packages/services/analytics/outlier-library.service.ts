import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  OutlierLibraryListParams,
  OutlierLibraryPostResponse,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface OutlierLibraryPage {
  docs: OutlierLibraryPostResponse[];
  limit: number;
  page: number;
  total: number;
}

/** The outlier library: other creators' public posts that beat their usual views. */
export class OutlierLibraryService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.OUTLIER_LIBRARY}`,
      token,
    );
  }

  public static getInstance(token: string): OutlierLibraryService {
    return HTTPBaseService.getBaseServiceInstance(
      OutlierLibraryService,
      token,
    ) as OutlierLibraryService;
  }

  public async listPosts(
    params: OutlierLibraryListParams,
    signal?: AbortSignal,
  ): Promise<OutlierLibraryPage> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params,
      signal,
    });
    const docs = deserializeCollection<OutlierLibraryPostResponse>(
      response.data,
    );
    const pagination = response.data.links?.pagination;
    return {
      docs,
      limit: pagination?.limit ?? params.limit ?? 50,
      page: pagination?.page ?? params.page ?? 1,
      total: pagination?.total ?? docs.length,
    };
  }
}

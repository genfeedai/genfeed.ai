import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  AdWatchedAdvertiser,
  CreateAdWatchedAdvertiserInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

/**
 * Client for the org/brand-scoped competitor watchlist that feeds paid-creative
 * ingestion. It stays on `HTTPBaseService` rather than `BaseService` because the
 * watchlist has no client-side model or serializer — the JSON:API attributes are
 * the shape the UI renders.
 */
export class AdWatchedAdvertisersService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.AD_WATCHED_ADVERTISERS}`,
      token,
    );
  }

  public static getInstance(token: string): AdWatchedAdvertisersService {
    return HTTPBaseService.getBaseServiceInstance(
      AdWatchedAdvertisersService,
      token,
    ) as AdWatchedAdvertisersService;
  }

  public async list(params: {
    brandId?: string;
  }): Promise<AdWatchedAdvertiser[]> {
    return await this.instance
      .get<JsonApiResponseDocument>('', {
        params: params.brandId ? { brandId: params.brandId } : {},
      })
      .then((response) =>
        extractCollection<AdWatchedAdvertiser>(response.data),
      );
  }

  public async create(
    input: CreateAdWatchedAdvertiserInput,
  ): Promise<AdWatchedAdvertiser> {
    return await this.instance
      .post<JsonApiResponseDocument>('', input)
      .then((response) => extractResource<AdWatchedAdvertiser>(response.data));
  }

  public async remove(id: string): Promise<void> {
    await this.instance.delete<JsonApiResponseDocument>(`/${id}`);
  }
}

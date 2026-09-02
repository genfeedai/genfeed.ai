import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateRssSourceInput,
  IRssSource,
  UpdateRssSourceInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class RssSourcesService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.RSS_SOURCES}`,
      token,
    );
  }

  public static getInstance(token: string): RssSourcesService {
    return HTTPBaseService.getBaseServiceInstance(
      RssSourcesService,
      token,
    ) as RssSourcesService;
  }

  async findAll(
    query: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<IRssSource[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    return extractCollection<IRssSource>(response.data);
  }

  async post(input: CreateRssSourceInput): Promise<IRssSource> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return extractResource<IRssSource>(response.data);
  }

  async patch(id: string, input: UpdateRssSourceInput): Promise<IRssSource> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return extractResource<IRssSource>(response.data);
  }

  async delete(id: string): Promise<void> {
    await this.instance.delete(`/${id}`);
  }

  async pollNow(id: string, signal?: AbortSignal): Promise<IRssSource> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/poll`,
      {},
      { signal },
    );
    return extractResource<IRssSource>(response.data);
  }
}

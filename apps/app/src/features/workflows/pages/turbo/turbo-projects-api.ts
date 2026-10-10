import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IAddTurboProjectItemsInput,
  ITurboProject,
  ITurboProjectIdeaSettings,
  ITurboProjectQuote,
  ICreateTurboProjectInput,
  IReviewTurboProjectItemsInput,
  IScheduleTurboProjectInput,
  IScheduleTurboProjectResult,
  IUpdateTurboProjectInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class TurboProjectsApi extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.TURBO_PROJECTS}`,
      token,
    );
  }
  async list(brandId: string, page: number, signal?: AbortSignal) {
    const { data } = await this.instance.get<JsonApiResponseDocument>('', {
      params: { brandId, page, limit: 50 },
      signal,
    });
    return deserializeCollection<ITurboProject>(data);
  }
  async get(id: string, signal?: AbortSignal) {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `/${id}`,
      { signal },
    );
    return deserializeResource<ITurboProject>(data);
  }
  async create(input: ICreateTurboProjectInput) {
    const { data } = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return deserializeResource<ITurboProject>(data);
  }
  async update(id: string, input: IUpdateTurboProjectInput) {
    const { data } = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return deserializeResource<ITurboProject>(data);
  }
  async remove(id: string) {
    await this.instance.delete(`/${id}`);
  }
  async addItems(id: string, input: IAddTurboProjectItemsInput) {
    return this.postProject(id, 'items', input);
  }
  async generateIdeas(id: string, input: ITurboProjectIdeaSettings) {
    return this.postProject(id, 'ideas', input);
  }
  async updateCaption(id: string, itemId: string, caption: string) {
    const { data } = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}/items/${itemId}`,
      { caption },
    );
    return deserializeResource<ITurboProject>(data);
  }
  async removeItem(id: string, itemId: string) {
    const { data } = await this.instance.delete<JsonApiResponseDocument>(
      `/${id}/items/${itemId}`,
    );
    return deserializeResource<ITurboProject>(data);
  }
  async quote(id: string, itemId?: string) {
    const { data } = await this.instance.post<{ data: ITurboProjectQuote }>(
      `/${id}/quote`,
      itemId ? { itemIds: [itemId] } : {},
    );
    return data.data;
  }
  async start(id: string, quoteId?: string) {
    return this.postProject(id, 'start', { quoteId });
  }
  async retry(id: string, itemId: string, quoteId?: string) {
    return this.postProject(id, `items/${itemId}/retry`, { quoteId });
  }
  async review(id: string, input: IReviewTurboProjectItemsInput) {
    return this.postProject(id, 'review', input);
  }
  async schedule(id: string, input: IScheduleTurboProjectInput) {
    const { data } = await this.instance.post<IScheduleTurboProjectResult>(
      `/${id}/schedule`,
      input,
    );
    return data;
  }
  private async postProject(id: string, action: string, input: object) {
    const { data } = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/${action}`,
      input,
    );
    return deserializeResource<ITurboProject>(data);
  }
}
export function createTurboProjectsApi(token: string) {
  return new TurboProjectsApi(token);
}

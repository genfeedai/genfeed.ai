import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IAddBatchProjectItemsInput,
  IBatchProject,
  IBatchProjectIdeaSettings,
  IBatchProjectQuote,
  ICreateBatchProjectInput,
  IReviewBatchProjectItemsInput,
  IScheduleBatchProjectInput,
  IScheduleBatchProjectResult,
  IUpdateBatchProjectInput,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class BatchProjectsApi extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BATCH_PROJECTS}`,
      token,
    );
  }
  async list(brandId: string, page: number, signal?: AbortSignal) {
    const { data } = await this.instance.get<JsonApiResponseDocument>('', {
      params: { brandId, page, limit: 50 },
      signal,
    });
    return deserializeCollection<IBatchProject>(data);
  }
  async get(id: string, signal?: AbortSignal) {
    const { data } = await this.instance.get<JsonApiResponseDocument>(
      `/${id}`,
      { signal },
    );
    return deserializeResource<IBatchProject>(data);
  }
  async create(input: ICreateBatchProjectInput) {
    const { data } = await this.instance.post<JsonApiResponseDocument>(
      '',
      input,
    );
    return deserializeResource<IBatchProject>(data);
  }
  async update(id: string, input: IUpdateBatchProjectInput) {
    const { data } = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}`,
      input,
    );
    return deserializeResource<IBatchProject>(data);
  }
  async remove(id: string) {
    await this.instance.delete(`/${id}`);
  }
  async addItems(id: string, input: IAddBatchProjectItemsInput) {
    return this.postProject(id, 'items', input);
  }
  async generateIdeas(id: string, input: IBatchProjectIdeaSettings) {
    return this.postProject(id, 'ideas', input);
  }
  async updateCaption(id: string, itemId: string, caption: string) {
    const { data } = await this.instance.patch<JsonApiResponseDocument>(
      `/${id}/items/${itemId}`,
      { caption },
    );
    return deserializeResource<IBatchProject>(data);
  }
  async removeItem(id: string, itemId: string) {
    const { data } = await this.instance.delete<JsonApiResponseDocument>(
      `/${id}/items/${itemId}`,
    );
    return deserializeResource<IBatchProject>(data);
  }
  async quote(id: string, itemId?: string) {
    const { data } = await this.instance.post<{ data: IBatchProjectQuote }>(
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
  async review(id: string, input: IReviewBatchProjectItemsInput) {
    return this.postProject(id, 'review', input);
  }
  async schedule(id: string, input: IScheduleBatchProjectInput) {
    const { data } = await this.instance.post<IScheduleBatchProjectResult>(
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
    return deserializeResource<IBatchProject>(data);
  }
}
export function createBatchProjectsApi(token: string) {
  return new BatchProjectsApi(token);
}

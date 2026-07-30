import type {
  RecurrencePreviewInput,
  RecurrencePreviewResult,
  UpdateRecurrenceSeriesInput,
} from '@api-types/contracts';
import { API_ENDPOINTS } from '@genfeedai/constants';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  extractCollection,
  extractResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export interface ReleaseGroupListQuery {
  brandId?: string;
  endDate: string;
  startDate: string;
}

export class ReleaseGroupsService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.POST_GROUPS}`,
      token,
    );
  }

  public static getInstance(token: string): ReleaseGroupsService {
    return HTTPBaseService.getBaseServiceInstance(
      ReleaseGroupsService,
      token,
    ) as ReleaseGroupsService;
  }

  async findAll(query: ReleaseGroupListQuery): Promise<IReleaseGroup[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
    });

    return extractCollection<IReleaseGroup>(response.data);
  }

  async findOne(releaseId: string): Promise<IReleaseGroup> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${releaseId}`,
    );

    return extractResource<IReleaseGroup>(response.data);
  }

  async getOne(groupId: string, signal?: AbortSignal): Promise<IReleaseGroup> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${groupId}`,
      { signal },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async preview(
    input: RecurrencePreviewInput,
    signal?: AbortSignal,
  ): Promise<RecurrencePreviewResult> {
    const response = await this.instance.post<RecurrencePreviewResult>(
      '/recurrence/preview',
      input,
      { signal },
    );
    return response.data;
  }

  async pauseFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'pause');
  }

  async resumeFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'resume');
  }

  async cancelFuture(groupId: string): Promise<IReleaseGroup> {
    return this.postSeriesAction(groupId, 'cancel-future');
  }

  async editFuture(
    groupId: string,
    input: UpdateRecurrenceSeriesInput,
  ): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}/series/future`,
      input,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  private async postSeriesAction(
    groupId: string,
    action: 'cancel-future' | 'pause' | 'resume',
  ): Promise<IReleaseGroup> {
    const patchAction =
      action === 'pause'
        ? 'series-pause'
        : action === 'resume'
          ? 'series-resume'
          : 'series-cancel-future';
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: patchAction },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async pause(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'pause' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async resume(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'resume' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async cancel(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'cancel' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async publishNow(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${groupId}`,
      { action: 'publish-now' },
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }
}

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
  type JsonApiResponseDocument,
} from '@services/core/json-api';

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

  async getOne(groupId: string): Promise<IReleaseGroup> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${groupId}`,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }

  async preview(
    input: RecurrencePreviewInput,
  ): Promise<RecurrencePreviewResult> {
    const response = await this.instance.post<RecurrencePreviewResult>(
      '/recurrence/preview',
      input,
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
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${groupId}/series/${action}`,
    );
    return deserializeResource<IReleaseGroup>(response.data);
  }
}

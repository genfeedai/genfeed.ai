import type {
  IAnnouncement,
  IAnnouncementBroadcastRequest,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { toPaginatedResponse } from '@services/core/paginated-response';

export class AdminAnnouncementsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/announcements`, token);
  }

  public static getInstance(token: string): AdminAnnouncementsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminAnnouncementsService,
      token,
    ) as AdminAnnouncementsService;
  }

  async broadcast(data: IAnnouncementBroadcastRequest): Promise<IAnnouncement> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      '/broadcast',
      data,
    );
    return deserializeResource<IAnnouncement>(response.data);
  }

  async getAnnouncements(
    query?: { limit?: number; page?: number; search?: string },
    signal?: AbortSignal,
  ): Promise<IPaginatedResponse<IAnnouncement>> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    return toPaginatedResponse(
      deserializeCollection<IAnnouncement>(response.data),
      response.data,
    );
  }
}

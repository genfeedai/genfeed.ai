import type {
  IAnnouncement,
  IAnnouncementBroadcastRequest,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { recordPageTotals } from '@services/core/page-totals';

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
    query?: { limit?: number; page?: number },
    signal?: AbortSignal,
  ): Promise<IAnnouncement[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: query,
      signal,
    });
    recordPageTotals(response.data, query);
    return deserializeCollection<IAnnouncement>(response.data);
  }
}

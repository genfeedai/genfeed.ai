import type {
  IAnnouncement,
  IAnnouncementBroadcastRequest,
} from '@cloud/interfaces';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

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

  async getAnnouncements(): Promise<IAnnouncement[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('');
    return deserializeCollection<IAnnouncement>(response.data);
  }
}

import type {
  ISystemNotificationDestinationInput,
  ISystemNotificationOverview,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';

export class AdminSystemNotificationsService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}/admin/system-notifications`,
      token,
    );
  }
  public static getInstance(token: string): AdminSystemNotificationsService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminSystemNotificationsService,
      token,
    ) as AdminSystemNotificationsService;
  }
  async overview(signal?: AbortSignal): Promise<ISystemNotificationOverview> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      signal,
    });
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
  async configure(
    isEnabled: boolean,
    eventTypes: string[],
  ): Promise<ISystemNotificationOverview> {
    const response = await this.instance.patch<JsonApiResponseDocument>('', {
      enabled: isEnabled,
      eventTypes,
    });
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
  async save(
    data: ISystemNotificationDestinationInput,
    id?: string,
  ): Promise<ISystemNotificationOverview> {
    const response = id
      ? await this.instance.patch<JsonApiResponseDocument>(
          `/destinations/${id}`,
          data,
        )
      : await this.instance.post<JsonApiResponseDocument>(
          '/destinations',
          data,
        );
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
  async remove(id: string): Promise<ISystemNotificationOverview> {
    const response = await this.instance.delete<JsonApiResponseDocument>(
      `/destinations/${id}`,
    );
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
  async test(id: string): Promise<ISystemNotificationOverview> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/destinations/${id}/test`,
    );
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
  async retry(id: string): Promise<ISystemNotificationOverview> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/deliveries/${id}/retry`,
    );
    return deserializeResource<ISystemNotificationOverview>(response.data);
  }
}

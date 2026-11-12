import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IBulkOperationResult,
  IBulkPatchData,
} from '@genfeedai/contracts/interfaces';
import { Activity } from '@genfeedai/models/analytics/activity.model';
import { BaseService } from '@services/core/base.service';
import { serializeRequest } from '@services/core/request-serializers';

export class ActivitiesService extends BaseService<Activity> {
  constructor(token: string) {
    super(API_ENDPOINTS.ACTIVITIES, token, Activity);
  }

  public static getInstance(token: string): ActivitiesService {
    return BaseService.getDataServiceInstance(ActivitiesService, token);
  }

  /** Unread activities in one scope, for the dot on the menu item. */
  async getUnreadCount(
    scope: { brandId?: string; organizationId?: string },
    signal?: AbortSignal,
  ): Promise<number> {
    const response = await this.instance.get<{ unreadCount?: number }>(
      '/unread-count',
      { params: scope, signal },
    );
    return response.data.unreadCount ?? 0;
  }

  async bulkPatch(data: IBulkPatchData): Promise<IBulkOperationResult> {
    // Serialize the data before sending
    const serializedData = await serializeRequest(
      'ActivityBulkPatchSerializer',
      data,
    );
    return await this.instance
      .patch('/', serializedData)
      .then((res) => res.data);
  }
}

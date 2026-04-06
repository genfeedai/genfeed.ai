import {
  ActivityBulkPatchSerializer,
  ActivitySerializer,
} from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  IBulkOperationResult,
  IBulkPatchData,
} from '@genfeedai/interfaces';
import { Activity } from '@models/analytics/activity.model';
import { BaseService } from '@services/core/base.service';

export class ActivitiesService extends BaseService<Activity> {
  constructor(token: string) {
    super(API_ENDPOINTS.ACTIVITIES, token, Activity, ActivitySerializer);
  }

  public static getInstance(token: string): ActivitiesService {
    return BaseService.getDataServiceInstance(
      ActivitiesService,
      token,
    ) as ActivitiesService;
  }

  async bulkPatch(data: IBulkPatchData): Promise<IBulkOperationResult> {
    // Serialize the data before sending
    const serializedData = ActivityBulkPatchSerializer.serialize(data);
    return await this.instance
      .patch('/', serializedData)
      .then((res) => res.data);
  }
}

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

import { Model } from '@genfeedai/client/models';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ModelSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class ModelsService extends BaseService<Model> {
  constructor(token: string) {
    super(API_ENDPOINTS.MODELS, token, Model, ModelSerializer);
  }

  public static getInstance(token: string): ModelsService {
    return BaseService.getDataServiceInstance(ModelsService, token);
  }

  public approveRegistryModel(
    id: string,
    body: Partial<Model> = {},
  ): Promise<Model> {
    return this.patch(id, { ...body, reviewStatus: 'approved' });
  }

  public rejectRegistryModel(id: string, reason?: string): Promise<Model> {
    const body: Partial<Model> & { reason?: string } = {
      reason,
      reviewStatus: 'rejected',
    };
    return this.patch(id, body);
  }

  public markRegistryModelLegacy(
    id: string,
    succeededBy?: string,
  ): Promise<Model> {
    const body: Partial<Model> & { succeededBy?: string } = {
      reviewStatus: 'legacy',
      succeededBy,
    };
    return this.patch(id, body);
  }
}

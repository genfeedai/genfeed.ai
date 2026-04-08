import { Model } from '@genfeedai/client/models';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ModelSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class ModelsService extends BaseService<Model> {
  constructor(token: string) {
    super(API_ENDPOINTS.MODELS, token, Model, ModelSerializer);
  }

  public static getInstance(token: string): ModelsService {
    return BaseService.getDataServiceInstance(
      ModelsService,
      token,
    ) as ModelsService;
  }
}

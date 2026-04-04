import { Model } from '@genfeedai/client/models';
import { ModelSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
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

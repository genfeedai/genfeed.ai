import { SceneSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementScene } from '@models/elements/scene.model';
import { BaseService } from '@services/core/base.service';

export class ScenesService extends BaseService<ElementScene> {
  constructor(token: string) {
    super(API_ENDPOINTS.SCENES, token, ElementScene, SceneSerializer);
  }

  public static getInstance(token: string): ScenesService {
    return BaseService.getDataServiceInstance(
      ScenesService,
      token,
    ) as ScenesService;
  }
}

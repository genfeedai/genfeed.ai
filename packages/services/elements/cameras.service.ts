import { CameraSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementCamera } from '@models/elements/camera.model';
import { BaseService } from '@services/core/base.service';

export class CamerasService extends BaseService<ElementCamera> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAMERAS, token, ElementCamera, CameraSerializer);
  }

  public static getInstance(token: string): CamerasService {
    return BaseService.getDataServiceInstance(
      CamerasService,
      token,
    ) as CamerasService;
  }
}

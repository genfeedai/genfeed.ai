import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementCamera } from '@genfeedai/models/elements/camera.model';
import { CameraSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class CamerasService extends BaseService<ElementCamera> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAMERAS, token, ElementCamera, CameraSerializer);
  }

  public static getInstance(token: string): CamerasService {
    return BaseService.getInstance.call(
      CamerasService,
      token,
    ) as CamerasService;
  }
}

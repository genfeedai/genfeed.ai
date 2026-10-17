import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementCamera } from '@genfeedai/models/elements/camera.model';
import { BaseService } from '@services/core/base.service';

export class CamerasService extends BaseService<ElementCamera> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAMERAS, token, ElementCamera);
  }

  public static getInstance(token: string): CamerasService {
    return BaseService.getDataServiceInstance(CamerasService, token);
  }
}

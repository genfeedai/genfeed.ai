import { API_ENDPOINTS } from '@genfeedai/constants';
import { CameraMovementSerializer } from '@genfeedai/serializers';
import { ElementCameraMovement } from '@models/elements/camera-movement.model';
import { BaseService } from '@services/core/base.service';

export class CameraMovementsService extends BaseService<ElementCameraMovement> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.CAMERA_MOVEMENTS,
      token,
      ElementCameraMovement,
      CameraMovementSerializer,
    );
  }

  public static getInstance(token: string): CameraMovementsService {
    return BaseService.getDataServiceInstance(
      CameraMovementsService,
      token,
    ) as CameraMovementsService;
  }
}

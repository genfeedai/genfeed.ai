import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementCameraMovement } from '@models/elements/camera-movement.model';

export interface CameraMovementsState {
  page: IPaginatedResponse<ElementCameraMovement> | null;
  isLoading: boolean;
}

export type CameraMovementsAction =
  | { type: 'FETCH_START'; payload: { isRefresh: boolean } }
  | { type: 'FETCH_DONE'; payload: IPaginatedResponse<ElementCameraMovement> }
  | { type: 'FETCH_ERROR' };

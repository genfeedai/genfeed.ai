import type { ElementCameraMovement } from '@models/elements/camera-movement.model';

export interface CameraMovementsState {
  cameraMovements: ElementCameraMovement[];
  isLoading: boolean;
}

export type CameraMovementsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CAMERA_MOVEMENTS'; payload: ElementCameraMovement[] }
  | { type: 'FETCH_START'; payload: { isRefresh: boolean } }
  | { type: 'FETCH_DONE'; payload: ElementCameraMovement[] }
  | { type: 'FETCH_ERROR' };

import type { IElementCameraMovement } from '@genfeedai/contracts/interfaces';
import type { ElementCameraMovement } from '@models/elements/camera-movement.model';

export interface CameraMovementsState {
  cameraMovements: ElementCameraMovement[];
  isLoading: boolean;
  selectedCameraMovement: IElementCameraMovement | null;
  adminOrg: string;
  adminBrand: string;
}

export type CameraMovementsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_CAMERA_MOVEMENTS'; payload: ElementCameraMovement[] }
  | { type: 'SET_SELECTED'; payload: IElementCameraMovement | null }
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ADMIN_ORG_AND_CLEAR_BRAND'; payload: string }
  | { type: 'FETCH_START'; payload: { isRefresh: boolean } }
  | { type: 'FETCH_DONE'; payload: ElementCameraMovement[] }
  | { type: 'FETCH_ERROR' };

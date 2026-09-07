import type { IElementScene } from '@genfeedai/contracts/interfaces';
import type { ElementScene } from '@models/elements/scene.model';

export type SceneFetchStatus = 'loading' | 'refreshing' | 'idle';

export interface ScenesState {
  adminOrg: string;
  adminBrand: string;
  scenes: ElementScene[];
  fetchStatus: SceneFetchStatus;
  selectedScene: IElementScene | null;
}

export type ScenesAction =
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; scenes: ElementScene[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED_SCENE'; scene: IElementScene | null };

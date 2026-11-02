import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementScene } from '@models/elements/scene.model';

export type SceneFetchStatus = 'loading' | 'refreshing' | 'idle';

export interface ScenesState {
  page: IPaginatedResponse<ElementScene> | null;
  fetchStatus: SceneFetchStatus;
}

export type ScenesAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; page: IPaginatedResponse<ElementScene> }
  | { type: 'FETCH_DONE' };

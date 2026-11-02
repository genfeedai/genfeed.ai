import type { ElementScene } from '@models/elements/scene.model';

export type SceneFetchStatus = 'loading' | 'refreshing' | 'idle';

export interface ScenesState {
  scenes: ElementScene[];
  fetchStatus: SceneFetchStatus;
}

export type ScenesAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; scenes: ElementScene[] }
  | { type: 'FETCH_DONE' };

import type { ProactiveWorkspaceResponse } from '@services/onboarding/onboarding.service';

export interface WorkspaceState {
  workspace: ProactiveWorkspaceResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

export type WorkspaceAction =
  | { type: 'LOAD_SUCCESS'; payload: ProactiveWorkspaceResponse }
  | { type: 'LOAD_ERROR'; payload: string }
  | { type: 'LOAD_DONE' }
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_SUCCESS'; payload: ProactiveWorkspaceResponse }
  | { type: 'REFRESH_DONE' };

import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementBlacklist } from '@models/elements/blacklist.model';

export interface BlacklistsState {
  page: IPaginatedResponse<ElementBlacklist> | null;
  isLoading: boolean;
  updatingIds: Set<string>;
}

export type BlacklistsAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; page: IPaginatedResponse<ElementBlacklist> }
  | { type: 'FETCH_DONE' }
  | { type: 'UPDATING_ADD'; id: string }
  | { type: 'UPDATING_REMOVE'; id: string };

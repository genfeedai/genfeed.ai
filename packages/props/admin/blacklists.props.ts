import type { ElementBlacklist } from '@models/elements/blacklist.model';

export interface BlacklistsState {
  blacklists: ElementBlacklist[];
  isLoading: boolean;
  updatingIds: Set<string>;
  selectedBlacklist: ElementBlacklist | null;
  adminOrg: string;
  adminBrand: string;
}

export type BlacklistsAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; blacklists: ElementBlacklist[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED'; blacklist: ElementBlacklist | null }
  | { type: 'UPDATING_ADD'; id: string }
  | { type: 'UPDATING_REMOVE'; id: string }
  | { type: 'SET_ADMIN_ORG'; org: string }
  | { type: 'SET_ADMIN_BRAND'; brand: string };

import type { IFontFamily } from '@genfeedai/contracts/interfaces';
import type { FontFamily } from '@models/elements/font-family.model';

export type FontFamiliesFetchStatus = 'idle' | 'loading' | 'refreshing';

export interface FontFamiliesState {
  fontFamilies: FontFamily[];
  fetchStatus: FontFamiliesFetchStatus;
  selectedFontFamily: IFontFamily | null;
  adminOrg: string;
  adminBrand: string;
}

export type FontFamiliesAction =
  | { type: 'FETCH_START'; isRefreshing: boolean }
  | { type: 'FETCH_SUCCESS'; fontFamilies: FontFamily[] }
  | { type: 'FETCH_DONE' }
  | { type: 'SET_SELECTED'; fontFamily: IFontFamily | null }
  | { type: 'SET_ADMIN_ORG'; orgId: string }
  | { type: 'SET_ADMIN_BRAND'; brandId: string };

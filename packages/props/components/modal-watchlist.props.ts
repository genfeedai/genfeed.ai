import type { IWatchlist } from '@cloud/interfaces';

export interface ModalWatchlistProps {
  item?: IWatchlist | null;
  onConfirm: (isRefreshing: boolean) => void;
  scope?: 'brand' | 'organization';
  brandId?: string;
}

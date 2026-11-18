import type { ReactNode } from 'react';
import type { AsyncState } from '@/props/shared';

export interface PublishingOverviewAsyncSectionProps<TData> {
  children: (data: TData) => ReactNode;
  errorMessage: string;
  loadingLabel: string;
  /** Row height the loading skeleton reserves. */
  loadingRowSize?: 'default' | 'media' | 'single' | 'tall';
  onRetry: () => void;
  state: AsyncState<TData>;
}

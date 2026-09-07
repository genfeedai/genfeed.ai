import type { AsyncState } from '@props/shared';
import type { ReactNode } from 'react';

export interface PublishingOverviewAsyncSectionProps<TData> {
  children: (data: TData) => ReactNode;
  errorMessage: string;
  loadingLabel: string;
  onRetry: () => void;
  state: AsyncState<TData>;
}

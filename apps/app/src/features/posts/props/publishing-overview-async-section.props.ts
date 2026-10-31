import type { ReactNode } from 'react';
import type { AsyncState } from '@/props/shared';

export interface PublishingOverviewAsyncSectionProps<TData> {
  children: (data: TData) => ReactNode;
  errorMessage: string;
  loadingLabel: string;
  onRetry: () => void;
  state: AsyncState<TData>;
}

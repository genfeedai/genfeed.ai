import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { useTranslations } from 'next-intl';
import type { PublishingOverviewAsyncSectionProps } from '@/features/posts/props/publishing-overview-async-section.props';

export default function PublishingOverviewAsyncSection<TData>({
  children,
  errorMessage,
  loadingLabel,
  onRetry,
  state,
}: PublishingOverviewAsyncSectionProps<TData>) {
  const translate = useTranslations('common');

  if (state.status === 'error') {
    return (
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
        role="alert"
      >
        <p className="text-sm text-destructive">{errorMessage}</p>
        <Button onClick={onRetry} withWrapper={false}>
          {translate('actions.retry')}
        </Button>
      </div>
    );
  }

  if (state.status === 'success') {
    return children(state.data);
  }

  return (
    <div
      aria-live="polite"
      className="space-y-2 px-4 py-3 sm:px-5"
      role="status"
    >
      <span className="sr-only">{loadingLabel}</span>
      <Skeleton aria-hidden="true" className="h-4 w-2/3" />
      <Skeleton aria-hidden="true" className="h-4 w-1/2" />
    </div>
  );
}

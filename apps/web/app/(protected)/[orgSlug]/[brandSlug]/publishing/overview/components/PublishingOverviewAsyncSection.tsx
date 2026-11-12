import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { PublishingOverviewAsyncSectionProps } from '@/features/posts/props/publishing-overview-async-section.props';

// Three rows hold about the height a short queue or account list will have.
const LOADING_ROWS = 3;

export default function PublishingOverviewAsyncSection<TData>({
  children,
  errorMessage,
  loadingLabel,
  loadingRowSize,
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
    <div aria-busy="true" role="status">
      <span className="sr-only">{loadingLabel}</span>
      <ListRowsSkeleton rows={LOADING_ROWS} size={loadingRowSize} />
    </div>
  );
}

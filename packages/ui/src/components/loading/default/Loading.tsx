import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LoadingProps } from '@genfeedai/props/ui/feedback/loading.props';
import BrandLoader from '@ui/feedback/brand-loader/BrandLoader';

/**
 * Centred loader for a region or a whole page: the brand mark, with an
 * optional message. `isFullSize` (default) fills the viewport; pass
 * `isFullSize={false}` for a region inside a page (it keeps 60vh).
 *
 * Which loading component:
 * - `Spinner` (primitives): inline, inside a button or beside a label.
 * - `Loading`: a region or page with nothing to show yet.
 * - `LazyLoadingFallback`: the `Suspense` fallback of a lazy component.
 * - `LoadingOverlay` (primitives): covers content that is already shown while it reloads.
 * - `BrandLoader`: the bare brand mark; `Loading` already renders it.
 * - `Skeleton` and its layouts: the shape of the content that is coming.
 */
export default function Loading({
  className = '',
  isFullSize = true,
  message,
}: LoadingProps) {
  const label = message ?? 'Loading';

  return (
    // Layout container only — the nested <BrandLoader> is the single status/live
    // region (role=status + aria-label). Making this wrapper an <output> too
    // produced two nested status regions with the same label.
    <div
      className={cn(
        'flex items-center justify-center text-center',
        isFullSize ? 'min-h-screen' : 'min-h-[60vh]',
        className,
      )}
    >
      <div className="flex max-w-md flex-col items-center gap-4 px-6">
        <BrandLoader label={label} />
        {message ? (
          <span className="text-sm text-muted-foreground">{message}</span>
        ) : null}
      </div>
    </div>
  );
}

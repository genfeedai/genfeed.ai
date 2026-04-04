import { ComponentSize, IngredientFormat } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { LazyLoadingFallbackProps } from '@props/ui/feedback/lazy-loading-fallback.props';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Spinner from '@ui/feedback/spinner/Spinner';
import Loading from '@ui/loading/default/Loading';

export default function LazyLoadingFallback({
  variant = 'skeleton',
  aspectRatio = IngredientFormat.SQUARE,
  isSpinnerEnabled = true,
  className = '',
}: LazyLoadingFallbackProps) {
  if (variant === 'full') {
    return <Loading isFullSize={true} />;
  }

  if (variant === 'minimal') {
    return <Loading isFullSize={false} />;
  }

  if (variant === 'grid') {
    return (
      <div className="container min-h-[calc(100vh-334px)] h-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    );
  }

  // Default skeleton variant with optional spinner overlay
  function getAspectClass(): string {
    switch (aspectRatio) {
      case IngredientFormat.PORTRAIT:
        return 'aspect-[9/16]';
      case IngredientFormat.LANDSCAPE:
        return 'aspect-[16/9]';
      default:
        return 'aspect-square';
    }
  }
  const aspectClass = getAspectClass();

  return (
    <div
      className={cn(
        'relative bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-700 overflow-hidden',
        aspectClass,
        className,
      )}
      role="status"
      aria-label="Loading content"
    >
      {/* Shimmer effect */}
      <div className="absolute inset-0 animate-shimmer" />

      {isSpinnerEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-black/10">
          <Spinner size={ComponentSize.MD} className="text-foreground/70" />
        </div>
      )}
    </div>
  );
}

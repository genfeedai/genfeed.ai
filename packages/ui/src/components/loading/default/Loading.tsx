import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LoadingProps } from '@genfeedai/props/ui/feedback/loading.props';
import BrandLoader from '@ui/feedback/brand-loader/BrandLoader';

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

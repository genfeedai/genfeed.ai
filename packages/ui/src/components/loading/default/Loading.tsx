import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LoadingProps } from '@genfeedai/props/ui/feedback/loading.props';
import Spinner from '@ui/feedback/spinner/Spinner';

export default function Loading({
  className = '',
  isFullSize = true,
  message,
}: LoadingProps) {
  const label = message ?? 'Loading';

  return (
    // Layout container only — the nested <Spinner> is the single status/live
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
        <Spinner
          ariaLabel={label}
          className="text-white/80"
          size={ComponentSize.LG}
        />
        {message ? (
          <span className="text-sm text-white/40">{message}</span>
        ) : null}
      </div>
    </div>
  );
}

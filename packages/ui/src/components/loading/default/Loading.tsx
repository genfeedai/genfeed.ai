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
    <div
      className={cn(
        'flex items-center justify-center text-center',
        isFullSize ? 'min-h-screen' : 'min-h-[60vh]',
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex max-w-md flex-col items-center gap-4 px-6">
        <Spinner
          ariaLabel={label}
          className="text-white/80"
          size={ComponentSize.LG}
        />
        {message ? (
          <output className="text-sm text-white/40">{message}</output>
        ) : null}
      </div>
    </div>
  );
}

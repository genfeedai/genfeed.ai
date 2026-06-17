import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LoadingOverlayProps } from '@genfeedai/props/ui/feedback/loading.props';
import Spinner from '@ui/feedback/spinner/Spinner';

export default function LoadingOverlay({
  message = 'Loading…',
  className = '',
}: LoadingOverlayProps) {
  return (
    <div
      aria-busy="true"
      role="alert"
      aria-live="polite"
      className={cn(
        'absolute inset-0 flex items-center justify-center z-20',
        className,
      )}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <span className="relative flex items-center gap-3 rounded-md border border-border/60 bg-background/90 px-3 py-2 text-sm text-foreground shadow-lg">
        <Spinner
          ariaLabel={message}
          className="text-white/80"
          size={ComponentSize.SM}
        />
        {message}
      </span>
    </div>
  );
}

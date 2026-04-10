import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { LoadingOverlayProps } from '@genfeedai/props/ui/feedback/loading.props';

export default function LoadingOverlay({
  message = 'Loading...',
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
      <div className="absolute bg-primary/5 inset-0 backdrop-blur-sm"></div>
      <span className="relative bg-black/10 w-full text-center text-white px-2 py-1 animate-pulse">
        {message}
      </span>
    </div>
  );
}

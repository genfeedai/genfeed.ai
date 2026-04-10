import { ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Spinner from '@ui/feedback/spinner/Spinner';
import type { ReactNode } from 'react';

interface PageLoadingStateProps {
  children?: ReactNode;
  className?: string;
  fullScreen?: boolean;
  message?: string;
}

export default function PageLoadingState({
  children,
  className = '',
  fullScreen = false,
  message,
}: PageLoadingStateProps) {
  return (
    <div
      aria-busy="true"
      aria-label={message ?? 'Loading'}
      aria-live="polite"
      className={cn(
        'flex items-center justify-center',
        fullScreen ? 'min-h-screen' : 'min-h-[60vh]',
        className,
      )}
      role="status"
    >
      <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center">
        <Spinner
          ariaLabel={message ?? 'Loading'}
          className="text-white/80"
          size={ComponentSize.LG}
        />
        {message ? (
          <output className="text-sm text-white/40">{message}</output>
        ) : null}
        {children}
      </div>
    </div>
  );
}

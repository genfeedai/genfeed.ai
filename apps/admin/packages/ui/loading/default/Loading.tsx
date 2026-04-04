import { cn } from '@helpers/formatting/cn/cn.util';
import type { LoadingProps } from '@props/ui/feedback/loading.props';

export default function Loading({ isFullSize = true }: LoadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col text-center justify-center items-center py-10',
        isFullSize ? 'min-h-screen' : 'min-h-full',
      )}
      aria-busy="true"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
    </div>
  );
}

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ReactElement } from 'react';

interface AnimatedStatusTextProps {
  className?: string;
  text: string;
}

/**
 * Busy/status label with a Cursor-style shimmer sweep. The gradient derives
 * from `currentColor`, so callers keep controlling the color via text classes.
 */
export function AnimatedStatusText({
  className,
  text,
}: AnimatedStatusTextProps): ReactElement {
  return (
    <output
      aria-label={text}
      className={cn(
        'inline-block min-w-0 truncate animate-text-shimmer',
        className,
      )}
    >
      {text}
    </output>
  );
}

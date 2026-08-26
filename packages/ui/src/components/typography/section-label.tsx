import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HTMLAttributes } from 'react';

export interface SectionLabelProps extends HTMLAttributes<HTMLSpanElement> {
  ref?: React.Ref<HTMLSpanElement>;
}

/** Uppercase tracking-widest label used across website/marketing pages */
function SectionLabel({ ref, className, ...props }: SectionLabelProps) {
  return (
    <span
      className={cn(
        'mb-6 block text-xs font-black uppercase tracking-widest text-muted-foreground',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}
SectionLabel.displayName = 'SectionLabel';

export { SectionLabel };

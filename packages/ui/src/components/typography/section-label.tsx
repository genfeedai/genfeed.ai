import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { forwardRef, type HTMLAttributes } from 'react';

export interface SectionLabelProps extends HTMLAttributes<HTMLSpanElement> {}

/** Uppercase tracking-widest label used across website/marketing pages */
const SectionLabel = forwardRef<HTMLSpanElement, SectionLabelProps>(
  ({ className, ...props }, ref) => (
    <span
      className={cn(
        'text-white/20 text-xs font-black uppercase tracking-widest mb-6 block',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
SectionLabel.displayName = 'SectionLabel';

export { SectionLabel };

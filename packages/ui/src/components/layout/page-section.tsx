import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export interface PageSectionProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Section title */
  title?: ReactNode;
  /** Section description */
  description?: ReactNode;
  /** Right-side actions (buttons, etc.) */
  actions?: ReactNode;
}

const PageSection = forwardRef<HTMLElement, PageSectionProps>(
  ({ actions, children, className, description, title, ...props }, ref) => (
    <section className={cn('space-y-4', className)} ref={ref} {...props}>
      {(title || description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title && (
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            )}
            {description && (
              <p className="text-sm text-foreground/60">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  ),
);
PageSection.displayName = 'PageSection';

export { PageSection };

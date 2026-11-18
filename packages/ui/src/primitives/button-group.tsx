import { cn } from '@genfeedai/helpers';
import type { ComponentProps } from 'react';

/**
 * Joins buttons (and a `ButtonGroupText` label) into one control: shared
 * borders, rounding only at the two ends (shadcn/ui Button Group).
 */
function ButtonGroup({ className, ...props }: ComponentProps<'fieldset'>) {
  return (
    <fieldset
      className={cn(
        'm-0 flex w-full min-w-0 items-stretch border-0 p-0 [&>*:focus-visible]:relative [&>*:focus-visible]:z-10 [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none',
        className,
      )}
      {...props}
    />
  );
}

/** A non-interactive segment of a group: a label that sits beside a button. */
function ButtonGroupText({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-tertiary px-3 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupText };

import { cn } from '@genfeedai/helpers';
import type { ComponentProps } from 'react';
import { focusRingInsetClassName } from './focus-ring';

/**
 * One field-height control made of segments: an addon (a switch, an icon, a
 * label) and icon buttons, split by hairlines and sharing one border and one
 * background (shadcn/ui Input Group). Use it when a state and the actions that
 * depend on it belong together, such as Public with Copy link and Open; use
 * `ButtonGroup` when every segment is a button.
 *
 * Put `inputGroupButtonClassName` on a `Button` (with `withWrapper={false}`)
 * placed in the group so it drops its own corners and ring.
 */
function InputGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-8 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-border bg-tertiary text-sm text-foreground transition-[box-shadow,border-color] duration-200',
        '[&>*+*]:border-l [&>*+*]:border-border',
        className,
      )}
      role="group"
      {...props}
    />
  );
}

/** A segment that is not the input: a switch, an icon or a short label. */
function InputGroupAddon({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 px-3 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

/** Classes for a `Button` or link inside the group: square, ring drawn inside. */
const inputGroupButtonClassName = cn(
  'rounded-none focus-visible:ring-offset-0',
  focusRingInsetClassName,
);

export {
  InputGroup,
  InputGroupAddon,
  inputGroupButtonClassName,
};

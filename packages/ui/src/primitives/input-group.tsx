import { cn } from '@genfeedai/helpers';
import type { ComponentProps } from 'react';
import { focusRingInsetClassName } from './focus-ring';

/**
 * One field-height control made of segments: an addon (a switch, an icon, a
 * label), a borderless input, and icon buttons, split by hairlines and
 * sharing one border, one background and one focus ring (shadcn/ui Input
 * Group). Use it when a value and the actions on it belong together, such as
 * a link with Copy and Open; use `ButtonGroup` when every segment is a button.
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
        'has-[input:focus-visible]:border-border-strong has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-background',
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

/** The borderless text field that takes the width the other segments leave. */
function InputGroupInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'w-0 min-w-0 flex-1 truncate bg-transparent px-3 text-sm text-foreground outline-hidden placeholder:text-gray-800 read-only:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
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
  InputGroupInput,
  inputGroupButtonClassName,
};

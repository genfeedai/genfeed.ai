import { cn } from '@genfeedai/helpers';
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

/**
 * A live/status marker: a coloured dot, or a text caret while content streams.
 * `tone` maps to theme tokens only; `current` follows the surrounding text
 * colour (a dot inside a destructive button). Decorative by default: pair it
 * with text, or pass `aria-label` and `role="img"` when it carries meaning.
 */
export const statusDotVariants = cva('inline-block shrink-0', {
  defaultVariants: {
    isPulsing: false,
    shape: 'dot',
    size: 'sm',
    tone: 'primary',
  },
  variants: {
    isPulsing: {
      false: '',
      true: 'animate-pulse motion-reduce:animate-none',
    },
    shape: {
      /** Thin text caret that blinks while content streams in. */
      caret: 'h-4 w-0.5 align-middle',
      dot: 'rounded-full',
    },
    size: {
      md: '',
      sm: '',
      xs: '',
    },
    tone: {
      current: 'bg-current',
      destructive: 'bg-destructive',
      foreground: 'bg-foreground',
      info: 'bg-info',
      muted: 'bg-muted-foreground',
      primary: 'bg-primary',
      success: 'bg-success',
      warning: 'bg-warning',
    },
  },
  compoundVariants: [
    { class: 'size-1.5', shape: 'dot', size: 'xs' },
    { class: 'size-2', shape: 'dot', size: 'sm' },
    { class: 'size-2.5', shape: 'dot', size: 'md' },
  ],
});

export interface StatusDotProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof statusDotVariants> {}

function StatusDot({
  className,
  isPulsing,
  shape,
  size,
  tone,
  ...props
}: StatusDotProps) {
  const hasLabel = props['aria-label'] !== undefined;

  return (
    <span
      aria-hidden={hasLabel ? undefined : true}
      className={cn(
        statusDotVariants({ isPulsing, shape, size, tone }),
        className,
      )}
      role={hasLabel ? 'img' : undefined}
      {...props}
    />
  );
}

export { StatusDot };

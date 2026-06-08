import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { VariantProps } from 'class-variance-authority';
import type { ElementType, HTMLAttributes, Ref } from 'react';
import { textVariants } from './text.variants';

export interface TextProps
  extends Omit<HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof textVariants> {
  /** HTML element to render. Defaults to `span`. */
  as?: ElementType;
  ref?: Ref<HTMLElement>;
}

function Text({
  ref,
  as: Component = 'span',
  className,
  color,
  size,
  weight,
  ...props
}: TextProps) {
  return (
    <Component
      className={cn(textVariants({ color, size, weight }), className)}
      ref={ref}
      {...props}
    />
  );
}
Text.displayName = 'Text';

export { Text };

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { stackVariants } from './stack.variants';

export interface StackProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {
  ref?: React.Ref<HTMLDivElement>;
}

function Stack({
  ref,
  className,
  direction,
  gap,
  align,
  justify,
  wrap,
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        stackVariants({ align, direction, gap, justify, wrap }),
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}
Stack.displayName = 'Stack';

/** Vertical stack — shorthand for `<Stack direction="column">` */
function VStack({ ref, ...props }: Omit<StackProps, 'direction'>) {
  return <Stack direction="column" ref={ref} {...props} />;
}
VStack.displayName = 'VStack';

/** Horizontal stack — shorthand for `<Stack direction="row">` */
function HStack({
  ref,
  align = 'center',
  ...props
}: Omit<StackProps, 'direction'>) {
  return <Stack align={align} direction="row" ref={ref} {...props} />;
}
HStack.displayName = 'HStack';

export { HStack, Stack, VStack };

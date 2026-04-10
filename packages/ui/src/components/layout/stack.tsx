import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

const stackVariants = cva('flex', {
  defaultVariants: {
    align: 'stretch',
    direction: 'column',
    gap: 4,
    justify: 'start',
    wrap: false,
  },
  variants: {
    align: {
      baseline: 'items-baseline',
      center: 'items-center',
      end: 'items-end',
      start: 'items-start',
      stretch: 'items-stretch',
    },
    direction: {
      column: 'flex-col',
      'column-reverse': 'flex-col-reverse',
      row: 'flex-row',
      'row-reverse': 'flex-row-reverse',
    },
    gap: {
      0: 'gap-0',
      1: 'gap-1',
      2: 'gap-2',
      3: 'gap-3',
      4: 'gap-4',
      5: 'gap-5',
      6: 'gap-6',
      8: 'gap-8',
      10: 'gap-10',
      12: 'gap-12',
    },
    justify: {
      around: 'justify-around',
      between: 'justify-between',
      center: 'justify-center',
      end: 'justify-end',
      evenly: 'justify-evenly',
      start: 'justify-start',
    },
    wrap: {
      false: 'flex-nowrap',
      true: 'flex-wrap',
    },
  },
});

export interface StackProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stackVariants> {}

const Stack = forwardRef<HTMLDivElement, StackProps>(
  ({ className, direction, gap, align, justify, wrap, ...props }, ref) => (
    <div
      className={cn(
        stackVariants({ align, direction, gap, justify, wrap }),
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Stack.displayName = 'Stack';

/** Vertical stack — shorthand for `<Stack direction="column">` */
const VStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack direction="column" ref={ref} {...props} />,
);
VStack.displayName = 'VStack';

/** Horizontal stack — shorthand for `<Stack direction="row">` */
const HStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  ({ align = 'center', ...props }, ref) => (
    <Stack align={align} direction="row" ref={ref} {...props} />
  ),
);
HStack.displayName = 'HStack';

export { HStack, Stack, stackVariants, VStack };

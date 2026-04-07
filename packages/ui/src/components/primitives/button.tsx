import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent bg-transparent text-sm font-normal normal-case tracking-normal transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: ButtonSize.DEFAULT,
      variant: ButtonVariant.DEFAULT,
    },
    variants: {
      size: {
        [ButtonSize.DEFAULT]: 'h-9 px-4 py-2',
        [ButtonSize.ICON]: 'h-9 w-9',
        [ButtonSize.LG]: 'h-10 px-8',
        [ButtonSize.PUBLIC]:
          'h-auto px-12 py-5 text-sm uppercase font-semibold',
        [ButtonSize.SM]: 'h-8 px-3 text-xs',
        [ButtonSize.XS]: 'h-7 px-2 text-xs',
      },
      variant: {
        // Primary - Neural Noir white button
        [ButtonVariant.DEFAULT]:
          'bg-white text-black hover:bg-white/90 hover:text-black',

        // Destructive
        [ButtonVariant.DESTRUCTIVE]:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',

        // Ghost - subtle for table actions
        [ButtonVariant.GHOST]:
          'text-white/40 hover:text-white hover:bg-white/5',

        // Link
        [ButtonVariant.LINK]:
          'text-white/60 underline-offset-4 hover:underline hover:text-white',

        // Outline - Neural Noir secondary
        [ButtonVariant.OUTLINE]:
          'border border-white/20 bg-transparent text-white hover:border-white/40 hover:bg-white/5',

        // Secondary - subtle background with border
        [ButtonVariant.SECONDARY]:
          'bg-white/5 text-white border border-white/20 hover:bg-white/10 hover:border-white/40',

        // Soft - for form elements
        [ButtonVariant.SOFT]:
          'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white',

        // Outline White - bordered white variant
        [ButtonVariant.OUTLINE_WHITE]:
          'border border-white bg-transparent text-white hover:bg-white/10',

        // White - solid white variant
        [ButtonVariant.WHITE]: 'bg-white text-black hover:bg-white/90',

        // Black - inverse of white, for light backgrounds
        [ButtonVariant.BLACK]: 'bg-black text-white hover:bg-black/80',

        // Unstyled - no styles applied, for custom styling
        [ButtonVariant.UNSTYLED]: '',

        // Generate - same as DEFAULT, used for generate/submit actions
        [ButtonVariant.GENERATE]:
          'bg-white text-black hover:bg-white/90 hover:text-black',
      },
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

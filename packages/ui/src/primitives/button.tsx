import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Slot } from '@radix-ui/react-slot';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';

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
        [ButtonVariant.BLACK]: 'bg-black text-white hover:bg-black/80',
        [ButtonVariant.DEFAULT]:
          'bg-white text-black hover:bg-white/90 hover:text-black',
        [ButtonVariant.DESTRUCTIVE]:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        [ButtonVariant.GENERATE]:
          'bg-white text-black hover:bg-white/90 hover:text-black',
        [ButtonVariant.GHOST]:
          'text-white/40 hover:text-white hover:bg-white/5',
        [ButtonVariant.LINK]:
          'text-white/60 underline-offset-4 hover:underline hover:text-white',
        [ButtonVariant.OUTLINE]:
          'border border-white/20 bg-transparent text-white hover:border-white/40 hover:bg-white/5',
        [ButtonVariant.OUTLINE_WHITE]:
          'border border-white bg-transparent text-white hover:bg-white/10',
        [ButtonVariant.SECONDARY]:
          'bg-white/5 text-white border border-white/20 hover:bg-white/10 hover:border-white/40',
        [ButtonVariant.SOFT]:
          'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:text-white',
        [ButtonVariant.UNSTYLED]: '',
        [ButtonVariant.WHITE]: 'bg-white text-black hover:bg-white/90',
      },
    },
  },
);

const TEXT_TRANSFORM_CLASSES: Record<string, string> = {
  capitalize: 'capitalize',
  lowercase: 'lowercase',
  none: 'normal-case',
  uppercase: 'uppercase',
};

export interface ButtonProps
  extends Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      'children' | 'onClick' | 'onMouseDown'
    >,
    VariantProps<typeof buttonVariants> {
  ariaLabel?: string;
  asChild?: boolean;
  children?: ReactNode;
  icon?: ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  isPingEnabled?: boolean;
  label?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  withWrapper?: boolean;
  wrapperClassName?: string;
}

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

function SimpleTooltip({
  children,
  isDisabled = false,
  label,
  position = 'top',
}: {
  children: ReactElement;
  isDisabled?: boolean;
  label: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}) {
  if (isDisabled || !label) {
    return children;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={position}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Spinner() {
  return (
    <span
      aria-label="Loading"
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"
      role="status"
    />
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      ariaLabel,
      asChild = false,
      children,
      className,
      disabled,
      icon,
      isDisabled = false,
      isLoading = false,
      isPingEnabled = false,
      label,
      onClick,
      onMouseDown,
      size,
      textTransform = 'none',
      tooltip,
      tooltipPosition = 'bottom',
      type = 'button',
      variant,
      withWrapper = true,
      wrapperClassName = '',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isButtonDisabled = disabled || isDisabled || isLoading;
    const resolvedVariant =
      variant && variant !== ButtonVariant.UNSTYLED
        ? variant
        : ButtonVariant.SOFT;
    const transformClass =
      TEXT_TRANSFORM_CLASSES[textTransform] ?? 'normal-case';
    const buttonClassName =
      variant === ButtonVariant.UNSTYLED
        ? cn(
            isButtonDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
            transformClass,
            className,
          )
        : cn(
            buttonVariants({
              className,
              size: size ?? ButtonSize.DEFAULT,
              variant: resolvedVariant,
            }),
            'transition-all duration-300',
            transformClass,
          );

    const content = asChild ? (
      children
    ) : (
      <>
        {isLoading ? <Spinner /> : icon}
        {isLoading && !icon ? null : (children ?? label)}
      </>
    );

    const buttonElement = (
      <Comp
        aria-label={ariaLabel}
        className={buttonClassName}
        disabled={isButtonDisabled}
        onClick={onClick}
        onMouseDown={onMouseDown}
        ref={ref}
        type={type}
        {...props}
      >
        {content}
      </Comp>
    );

    const wrappedButton = withWrapper ? (
      <div className={cn('relative inline-flex', wrapperClassName)}>
        {isPingEnabled ? (
          <span className="absolute -top-1 -right-1 h-3 w-3 animate-ping rounded-full bg-red-500" />
        ) : null}
        {buttonElement}
      </div>
    ) : (
      buttonElement
    );

    if (!tooltip) {
      return wrappedButton;
    }

    return (
      <SimpleTooltip label={tooltip} position={tooltipPosition}>
        {wrappedButton as React.ReactElement}
      </SimpleTooltip>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };

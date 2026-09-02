import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers';
import { Slot } from '@radix-ui/react-slot';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithRef,
  MouseEvent,
  ReactElement,
  ReactNode,
} from 'react';
import {
  type ButtonStyleProps,
  buttonVariants,
  resolveButtonVariant,
  TEXT_TRANSFORM_CLASSES,
} from './button.variants';

export interface ButtonProps
  extends Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      'children' | 'onClick' | 'onMouseDown'
    >,
    ButtonStyleProps {
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
  ref?: React.Ref<HTMLButtonElement>;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  tooltip?: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  withWrapper?: boolean;
  wrapperClassName?: string;
}

const TooltipProvider: typeof TooltipPrimitive.Provider =
  TooltipPrimitive.Provider;

const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

const TooltipTrigger: typeof TooltipPrimitive.Trigger =
  TooltipPrimitive.Trigger;

function TooltipContent({
  ref,
  className,
  sideOffset = 4,
  ...props
}: ComponentPropsWithRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-50 overflow-hidden rounded-md bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-dropdown animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
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

function Spinner({
  'aria-hidden': ariaHidden,
}: {
  'aria-hidden'?: boolean | 'true' | 'false';
}) {
  return (
    <output
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'Loading'}
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"
    />
  );
}

function Button({
  ref,
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
  size = ButtonSize.DEFAULT,
  textTransform,
  tooltip,
  tooltipPosition = 'bottom',
  type = 'button',
  variant = ButtonVariant.DEFAULT,
  withWrapper = true,
  wrapperClassName = '',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const isButtonDisabled = disabled || isDisabled || isLoading;
  const resolvedVariant = resolveButtonVariant(variant);
  // Product buttons use title case (first letter of each word). PUBLIC
  // (marketing) size stays uppercase for website CTAs. Explicit textTransform
  // always wins when set.
  const effectiveTextTransform =
    textTransform ?? (size === ButtonSize.PUBLIC ? 'uppercase' : 'capitalize');
  const transformClass =
    TEXT_TRANSFORM_CLASSES[effectiveTextTransform] ?? 'capitalize';

  const content = asChild ? (
    children
  ) : (
    <>
      {/* The spinner is decorative: its "Loading" label must not join the
          button's accessible name while an action is pending. */}
      {isLoading ? <Spinner aria-hidden="true" /> : icon}
      {isLoading && !icon ? null : (children ?? label)}
    </>
  );

  const buttonElement =
    resolvedVariant === ButtonVariant.UNSTYLED ? (
      <Comp
        aria-label={ariaLabel}
        className={cn(
          isButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          transformClass,
          className,
        )}
        disabled={isButtonDisabled}
        onClick={onClick}
        onMouseDown={onMouseDown}
        ref={ref}
        type={type}
        {...props}
      >
        {content}
      </Comp>
    ) : (
      <Comp
        aria-label={ariaLabel}
        className={cn(
          // Lucide defaults to 24px; buttons use 16px unless the icon sets size.
          '[&_svg:not([class*="size-"])]:size-4',
          buttonVariants({ size, variant: resolvedVariant }),
          transformClass,
          className,
        )}
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
        <span className="absolute -top-1 -right-1 size-3 animate-ping rounded-full bg-destructive" />
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
      {wrappedButton as ReactElement}
    </SimpleTooltip>
  );
}

Button.displayName = 'Button';

export { Button };

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Slot } from '@radix-ui/react-slot';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  Button as ShipButton,
  buttonVariants as shipButtonVariants,
} from '@shipshitdev/ui/primitives';
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

const TEXT_TRANSFORM_CLASSES: Record<string, string> = {
  capitalize: 'capitalize',
  lowercase: 'lowercase',
  none: 'normal-case',
  uppercase: 'uppercase',
};

type ButtonVariantConfig = {
  shipVariant:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'pill';
};

const BUTTON_VARIANT_CONFIG: Record<ButtonVariant, ButtonVariantConfig> = {
  [ButtonVariant.BLACK]: { shipVariant: 'default' },
  [ButtonVariant.DEFAULT]: { shipVariant: 'default' },
  [ButtonVariant.DESTRUCTIVE]: { shipVariant: 'destructive' },
  [ButtonVariant.GENERATE]: { shipVariant: 'default' },
  [ButtonVariant.GHOST]: { shipVariant: 'ghost' },
  [ButtonVariant.LINK]: { shipVariant: 'link' },
  [ButtonVariant.OUTLINE]: { shipVariant: 'outline' },
  [ButtonVariant.OUTLINE_WHITE]: { shipVariant: 'outline' },
  [ButtonVariant.SECONDARY]: { shipVariant: 'secondary' },
  [ButtonVariant.SOFT]: { shipVariant: 'secondary' },
  [ButtonVariant.UNSTYLED]: { shipVariant: 'default' },
  [ButtonVariant.WHITE]: { shipVariant: 'default' },
};

function getMappedButtonSize(size?: ButtonSize | null) {
  switch (size) {
    case ButtonSize.SM:
      return 'sm';
    case ButtonSize.LG:
      return 'lg';
    case ButtonSize.XS:
      return 'xs';
    case ButtonSize.ICON:
      return 'icon';
    case ButtonSize.PUBLIC:
      return 'xl';
    case ButtonSize.DEFAULT:
    default:
      return 'default';
  }
}

function getVariantOverrideClassName(variant?: ButtonVariant | null) {
  switch (variant) {
    case ButtonVariant.BLACK:
      return '!border-transparent !bg-black !text-white hover:!bg-black/90';
    case ButtonVariant.GENERATE:
      return '!border-transparent !bg-foreground !text-background hover:!bg-foreground/90';
    case ButtonVariant.OUTLINE_WHITE:
      return '!border-white/18 !bg-transparent !text-white hover:!bg-white/[0.04]';
    case ButtonVariant.SOFT:
      return '!border-transparent !bg-secondary !text-secondary-foreground hover:!bg-secondary/80';
    case ButtonVariant.WHITE:
      return '!border-transparent !bg-white !text-black hover:!bg-white/90';
    default:
      return '';
  }
}

function getSizeOverrideClassName(size?: ButtonSize | null) {
  if (size === ButtonSize.PUBLIC) {
    return 'h-10 px-5 text-[14px] uppercase tracking-[0.18em]';
  }

  return '';
}

type ButtonStyleProps = {
  className?: string;
  size?: ButtonSize | null;
  variant?: ButtonVariant | null;
};

const buttonVariants = ({
  className,
  size = ButtonSize.DEFAULT,
  variant = ButtonVariant.DEFAULT,
}: ButtonStyleProps = {}) => {
  const resolvedVariant = variant ?? ButtonVariant.DEFAULT;

  if (resolvedVariant === ButtonVariant.UNSTYLED) {
    return className ?? '';
  }

  return cn(
    'ship-ui',
    shipButtonVariants({
      size: getMappedButtonSize(size),
      variant: BUTTON_VARIANT_CONFIG[resolvedVariant].shipVariant,
    }),
    getVariantOverrideClassName(resolvedVariant),
    getSizeOverrideClassName(size),
    className,
  );
};

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
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]"
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
      size = ButtonSize.DEFAULT,
      textTransform = 'none',
      tooltip,
      tooltipPosition = 'bottom',
      type = 'button',
      variant = ButtonVariant.DEFAULT,
      withWrapper = true,
      wrapperClassName = '',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isButtonDisabled = disabled || isDisabled || isLoading;
    const resolvedVariant = variant ?? ButtonVariant.DEFAULT;
    const transformClass =
      TEXT_TRANSFORM_CLASSES[textTransform] ?? 'normal-case';
    const variantClassName = getVariantOverrideClassName(resolvedVariant);
    const sizeClassName = getSizeOverrideClassName(size);

    const content = asChild ? (
      children
    ) : (
      <>
        {isLoading ? <Spinner /> : icon}
        {isLoading && !icon ? null : (children ?? label)}
      </>
    );

    const buttonElement =
      resolvedVariant === ButtonVariant.UNSTYLED ? (
        <Comp
          aria-label={ariaLabel}
          className={cn(
            isButtonDisabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer',
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
        <ShipButton
          aria-label={ariaLabel}
          asChild={asChild}
          className={cn(
            'ship-ui',
            variantClassName,
            sizeClassName,
            transformClass,
            className,
          )}
          disabled={isButtonDisabled}
          onClick={onClick}
          onMouseDown={onMouseDown}
          ref={ref}
          size={getMappedButtonSize(size)}
          type={type}
          variant={BUTTON_VARIANT_CONFIG[resolvedVariant].shipVariant}
          {...props}
        >
          {content}
        </ShipButton>
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
        {wrappedButton as ReactElement}
      </SimpleTooltip>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };

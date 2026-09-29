import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { Slot } from '@radix-ui/react-slot';
import BrandMark from '@ui/primitives/brand-mark';
import type {
  ButtonHTMLAttributes,
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
import ButtonTooltip from './button-tooltip';

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

function Spinner({
  'aria-hidden': ariaHidden,
}: {
  'aria-hidden'?: boolean | 'true' | 'false';
}) {
  return (
    <output
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'Loading'}
      className="genfeed-loader-root inline-flex size-4 shrink-0 items-center justify-center"
    >
      <BrandMark />
    </output>
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
  isStatic = false,
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
          buttonVariants({ isStatic, size, variant: resolvedVariant }),
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
    <ButtonTooltip label={tooltip} position={tooltipPosition}>
      {wrappedButton as ReactElement}
    </ButtonTooltip>
  );
}

Button.displayName = 'Button';

export { Button };

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { BaseButtonProps } from '@props/ui/forms/button.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { buttonVariants } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { forwardRef } from 'react';

/**
 * CVA variant type (excludes 'unstyled' which bypasses CVA)
 */
type CvaVariant = Exclude<ButtonVariant, ButtonVariant.UNSTYLED>;

const TEXT_TRANSFORM_CLASSES: Record<string, string> = {
  capitalize: 'capitalize',
  lowercase: 'lowercase',
  none: 'normal-case',
  uppercase: 'uppercase',
};

const Button = forwardRef<HTMLButtonElement, BaseButtonProps>(
  (
    {
      label,
      icon,
      className = '',
      wrapperClassName = '',
      tooltip,
      tooltipPosition = 'bottom',
      ariaLabel,
      type = 'button',
      isLoading = false,
      isDisabled = false,
      isPingEnabled = false,
      withWrapper = true,
      textTransform = 'none',
      variant,
      size,
      children,
      onClick,
      onMouseDown,
      ...rest
    },
    ref,
  ) => {
    const isButtonDisabled = isDisabled || isLoading;
    const usePortalTooltip = Boolean(tooltip);

    // Resolve variant: explicit prop > default to 'soft'
    const resolvedVariant: CvaVariant =
      variant && variant !== ButtonVariant.UNSTYLED
        ? variant
        : ButtonVariant.SOFT;

    const transformClass =
      TEXT_TRANSFORM_CLASSES[textTransform] ?? 'normal-case';

    const cursorClass = isButtonDisabled
      ? 'cursor-not-allowed'
      : 'cursor-pointer';

    const buttonClassName =
      variant === ButtonVariant.UNSTYLED
        ? cn(cursorClass, className)
        : cn(
            buttonVariants({
              size: size ?? ButtonSize.DEFAULT,
              variant: resolvedVariant,
            }),
            'transition-all duration-300',
            cursorClass,
            transformClass,
            className,
          );

    const content = (
      <>
        {isLoading ? <Spinner /> : icon}
        {isLoading && !icon ? null : (children ?? label)}
      </>
    );

    const buttonElement = (
      <button
        ref={ref}
        type={type}
        className={buttonClassName}
        disabled={isButtonDisabled}
        aria-label={ariaLabel}
        onClick={onClick}
        onMouseDown={onMouseDown}
        {...rest}
      >
        {content}
      </button>
    );

    // Wrap with container for ping indicator
    const wrapWithContainer = (element: React.ReactNode): React.ReactNode => {
      if (!withWrapper) {
        return element;
      }
      return (
        <div className={cn('relative inline-flex', wrapperClassName)}>
          {isPingEnabled && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 animate-ping rounded-full" />
          )}
          {element}
        </div>
      );
    };

    const wrappedButton = wrapWithContainer(buttonElement);

    if (usePortalTooltip) {
      return (
        <SimpleTooltip label={tooltip ?? ''} position={tooltipPosition}>
          {wrappedButton as React.ReactElement}
        </SimpleTooltip>
      );
    }

    return wrappedButton;
  },
);

Button.displayName = 'Button';

export default Button;
export { buttonVariants };

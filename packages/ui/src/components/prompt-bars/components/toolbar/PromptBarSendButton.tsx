'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PromptBarSendButtonProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowUp } from 'lucide-react';
import type { ReactElement } from 'react';

/** The one send control every prompt bar shares. */
export default function PromptBarSendButton({
  ariaLabel,
  className,
  icon,
  isAriaDisabled = false,
  isDisabled = false,
  isLoading = false,
  onClick,
  ref,
  testId,
  tooltip,
  ...buttonProps
}: PromptBarSendButtonProps): ReactElement {
  return (
    <Button
      {...buttonProps}
      ariaLabel={ariaLabel}
      aria-disabled={isAriaDisabled || undefined}
      className={cn('size-8 shrink-0 min-h-0 min-w-0 p-0', className)}
      data-testid={testId}
      icon={icon ?? <ArrowUp className="size-3.5" />}
      isDisabled={isDisabled}
      isLoading={isLoading}
      onClick={onClick}
      ref={ref}
      size={ButtonSize.ICON}
      tooltip={tooltip}
      tooltipPosition="top"
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    />
  );
}

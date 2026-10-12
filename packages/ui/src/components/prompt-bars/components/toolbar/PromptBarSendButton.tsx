'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PromptBarSendButtonProps } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ArrowUp } from 'lucide-react';
import type { ReactElement } from 'react';

/** The one send control every prompt bar shares; size follows toolbar density. */
export default function PromptBarSendButton({
  ariaLabel,
  className,
  density = 'default',
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
  const isCompact = density === 'compact';

  return (
    <Button
      {...buttonProps}
      ariaLabel={ariaLabel}
      aria-disabled={isAriaDisabled || undefined}
      className={cn(
        'shrink-0 min-h-0 min-w-0 p-0',
        isCompact ? 'size-8' : 'size-9',
        className,
      )}
      data-testid={testId}
      icon={icon ?? <ArrowUp className={isCompact ? 'size-3.5' : 'size-4'} />}
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

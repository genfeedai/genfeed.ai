'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarIconButtonProps } from '@genfeedai/props/prompt-bars/prompt-bar-icon-button.props';
import { PROMPT_BAR_ICON_BUTTON_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

/**
 * The one icon-only tool button on a prompt-bar toolbar (attach, style
 * references, settings): a 32px ghost square with a 14px glyph, the same box
 * as the send button and the mic.
 */
export default function PromptBarIconButton({
  ariaLabel,
  className,
  icon,
  isDisabled = false,
  onClick,
  ref,
  testId,
  tooltip,
  ...buttonProps
}: PromptBarIconButtonProps): ReactElement {
  return (
    <Button
      {...buttonProps}
      ariaLabel={ariaLabel}
      className={cn(PROMPT_BAR_ICON_BUTTON_CLASS, className)}
      data-testid={testId}
      icon={icon}
      isDisabled={isDisabled}
      onClick={onClick}
      ref={ref}
      size={ButtonSize.ICON}
      tooltip={tooltip ?? ariaLabel}
      tooltipPosition="top"
      variant={ButtonVariant.GHOST}
      withWrapper={false}
    />
  );
}

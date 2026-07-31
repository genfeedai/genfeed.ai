'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ButtonRefreshProps } from '@genfeedai/props/ui/forms/button.props';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { RefreshCw } from 'lucide-react';

export default function ButtonRefresh({
  onClick,
  isRefreshing = false,
  className = '',
  variant = ButtonVariant.GHOST,
}: ButtonRefreshProps) {
  return (
    <Button
      onClick={onClick}
      isLoading={isRefreshing}
      variant={variant}
      size={ButtonSize.ICON}
      ariaLabel="Refresh"
      className={cn(SHELL_ICON_BUTTON_CLASS, className)}
      tooltip="Refresh"
      withWrapper={false}
      icon={
        <RefreshCw
          className={cn(SHELL_ICON_CLASS, isRefreshing && 'animate-spin')}
          aria-hidden="true"
        />
      }
    />
  );
}

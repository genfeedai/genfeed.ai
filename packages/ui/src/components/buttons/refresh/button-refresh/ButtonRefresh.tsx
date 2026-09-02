'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ButtonRefreshProps } from '@genfeedai/props/ui/forms/button.props';
import Spinner from '@ui/feedback/spinner/Spinner';
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
}: ButtonRefreshProps) {
  return (
    <Button
      onClick={onClick}
      variant={ButtonVariant.GHOST}
      size={ButtonSize.ICON}
      ariaLabel="Refresh"
      className={cn(SHELL_ICON_BUTTON_CLASS, className)}
      tooltip="Refresh"
      withWrapper={false}
      icon={
        isRefreshing ? (
          <Spinner
            size={ComponentSize.XS}
            className={SHELL_ICON_CLASS}
            aria-hidden="true"
            ariaLabel=""
          />
        ) : (
          <RefreshCw className={SHELL_ICON_CLASS} aria-hidden="true" />
        )
      }
    />
  );
}

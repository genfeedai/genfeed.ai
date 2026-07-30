'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ButtonRefreshProps } from '@genfeedai/props/ui/forms/button.props';
import { Button } from '@ui/primitives/button';
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
      className={className}
      tooltip="Refresh"
      label={
        <RefreshCw className={cn('size-4', isRefreshing && 'animate-spin')} />
      }
    />
  );
}

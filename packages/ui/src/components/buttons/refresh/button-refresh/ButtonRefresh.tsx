'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ButtonRefreshProps } from '@props/ui/forms/button.props';
import { Button } from '@ui/primitives/button';
import { HiArrowPath } from 'react-icons/hi2';

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
        <HiArrowPath
          className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
        />
      }
    />
  );
}

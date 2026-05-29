'use client';

import type { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { SimpleTooltip } from './tooltip';

type SelectedOptionShape = {
  badge?: string;
  badgeVariant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
};

type BadgeDisplayVariant =
  | 'default'
  | 'destructive'
  | 'info'
  | 'outline'
  | 'secondary'
  | 'success'
  | 'warning';

function resolveBadgeVariant(
  variant: SelectedOptionShape['badgeVariant'],
): BadgeDisplayVariant {
  switch (variant) {
    case 'error':
      return 'destructive';
    case 'accent':
    case 'primary':
      return 'default';
    case 'info':
    case 'secondary':
    case 'success':
    case 'warning':
      return variant;
    default:
      return 'default';
  }
}

type DropdownTriggerProps = {
  name: string;
  icon?: ReactNode;
  label?: string;
  triggerDisplay: 'default' | 'icon-only';
  variant: ButtonVariant;
  size?: ButtonSize;
  isRequired: boolean;
  isDisabled: boolean;
  isFullWidth: boolean;
  isOpen: boolean;
  className: string;
  selectedOption: SelectedOptionShape | undefined;
  selectedLabel: string;
  tooltipLabel: string;
  ariaLabel: string;
  onToggle: () => void;
  onMouseDown: () => void;
};

export default function DropdownTrigger({
  name,
  icon,
  label,
  triggerDisplay,
  variant,
  size,
  isRequired,
  isDisabled,
  isFullWidth,
  isOpen,
  className,
  selectedOption,
  selectedLabel,
  tooltipLabel,
  ariaLabel,
  onToggle,
  onMouseDown,
}: DropdownTriggerProps) {
  const wrapperClass = isFullWidth ? 'w-full' : 'w-auto flex-shrink-0';

  const buttonClassName = cn(
    'flex items-center capitalize whitespace-nowrap',
    isFullWidth ? 'w-full' : 'w-auto',
    triggerDisplay === 'icon-only' && 'justify-center px-0 w-9 max-w-9',
    triggerDisplay !== 'icon-only' && icon && !isFullWidth
      ? 'px-2 gap-2 max-w-52'
      : '',
    triggerDisplay !== 'icon-only' && icon && isFullWidth
      ? 'px-2 gap-2 justify-start'
      : '',
    !icon ? 'pl-4 pr-8' : '',
    className,
    isDisabled && 'opacity-50 cursor-not-allowed',
  );

  const getDisplayLabel = () => {
    if (triggerDisplay === 'icon-only' && icon) {
      return <span className="flex items-center">{icon}</span>;
    }

    if (icon) {
      return (
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex min-w-0 flex-shrink-1 items-center gap-2">
            <span className="flex-shrink-0">{icon}</span>
            <span className="hidden truncate sm:inline">{selectedLabel}</span>
          </span>
          {selectedOption?.badge && (
            <Badge
              variant={resolveBadgeVariant(selectedOption.badgeVariant)}
              className="flex-shrink-0"
            >
              {selectedOption.badge}
            </Badge>
          )}
        </span>
      );
    }

    return (
      <span className="flex items-center gap-2">
        <span className="text-sm text-foreground/50">{label || name}:</span>
        <span className="text-sm font-medium">{selectedLabel}</span>
      </span>
    );
  };

  const triggerButton = (
    <Button
      variant={variant}
      size={size}
      aria-required={isRequired || undefined}
      className={buttonClassName}
      wrapperClassName={cn(wrapperClass)}
      onClick={onToggle}
      onMouseDown={onMouseDown}
      isDisabled={isDisabled}
      aria-expanded={isOpen}
      ariaLabel={ariaLabel}
      label={getDisplayLabel()}
      withWrapper={icon && label ? false : undefined}
    />
  );

  if (icon && label) {
    return (
      <SimpleTooltip
        label={tooltipLabel}
        position="top"
        isDisabled={isDisabled}
      >
        <div className={cn('capitalize', wrapperClass)}>{triggerButton}</div>
      </SimpleTooltip>
    );
  }

  return triggerButton;
}

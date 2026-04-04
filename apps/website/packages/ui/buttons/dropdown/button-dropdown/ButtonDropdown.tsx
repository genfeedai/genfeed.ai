'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ButtonDropdownProps } from '@props/ui/forms/button.props';
import {
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { HiChevronDown } from 'react-icons/hi2';

export default function ButtonDropdown({
  name,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  isDisabled = false,
  icon,
  tooltip,
  triggerDisplay = 'default',
  variant = ButtonVariant.GHOST,
}: ButtonDropdownProps) {
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;
  const accessibleLabel = tooltip || displayLabel;
  const isIconOnly = triggerDisplay === 'icon-only';

  const handleSelect = (optionValue: string) => {
    onChange(name, optionValue);
  };

  const trigger = (
    <PrimitiveButton
      className={cn(
        buttonVariants({
          size: ButtonSize.SM,
          variant,
        }),
        'font-medium',
        value ? 'text-foreground' : 'text-foreground/70',
        isIconOnly && 'w-9 px-0 justify-center',
        className,
      )}
      disabled={isDisabled}
      aria-label={accessibleLabel}
    >
      {isIconOnly ? (
        icon
      ) : (
        <>
          <span className="text-xs font-medium">{displayLabel}</span>
          <HiChevronDown className="h-3 w-3 text-foreground/50 transition-transform data-[state=open]:rotate-180" />
        </>
      )}
    </PrimitiveButton>
  );

  return (
    <DropdownMenu>
      {isIconOnly && tooltip ? (
        <SimpleTooltip label={tooltip} position="top" isDisabled={isDisabled}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        </SimpleTooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        align="end"
        className="min-w-40 max-w-48 max-h-64 overflow-y-auto"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => handleSelect(option.value)}
            className={cn(
              'cursor-pointer',
              option.value === value && 'bg-accent font-medium',
            )}
          >
            {option.icon && (
              <span className="mr-2 flex items-center">{option.icon}</span>
            )}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

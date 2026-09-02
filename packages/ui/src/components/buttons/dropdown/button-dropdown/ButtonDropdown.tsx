'use client';

import {
  ButtonSize,
  ButtonVariant,
  DropdownDirection,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ButtonDropdownProps } from '@genfeedai/props/ui/forms/button.props';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { ChevronDown } from 'lucide-react';

export default function ButtonDropdown({
  name,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className = '',
  isDisabled = false,
  icon,
  tooltip,
  triggerDisplay = 'default',
  variant = ButtonVariant.GHOST,
  direction = DropdownDirection.DOWN,
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
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      className={cn(
        buttonVariants({
          size: ButtonSize.SM,
          variant,
        }),
        SHELL_CONTROL_HEIGHT_CLASS,
        'gap-1.5 px-2.5 font-medium',
        value ? 'text-foreground' : 'text-foreground/70',
        isIconOnly && 'size-8 w-8 justify-center px-0',
        className,
      )}
      disabled={isDisabled}
      aria-label={accessibleLabel}
    >
      {isIconOnly ? (
        icon
      ) : (
        <>
          {icon ? (
            <span className="flex items-center [&_svg]:size-3.5 [&_svg]:shrink-0">
              {icon}
            </span>
          ) : null}
          <span className="text-xs font-medium leading-none">
            {displayLabel}
          </span>
          <ChevronDown
            className={cn(
              SHELL_ICON_CLASS,
              'text-foreground/50 transition-transform data-[state=open]:rotate-180',
            )}
          />
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
        side={direction === DropdownDirection.UP ? 'top' : 'bottom'}
        className="min-w-32 max-w-40 max-h-64 overflow-y-auto p-0.5"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => handleSelect(option.value)}
            className={cn(
              'min-h-8 cursor-pointer rounded-sm px-2.5 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
              option.value === value &&
                'bg-background-tertiary font-medium text-foreground',
            )}
          >
            {option.icon && (
              <span className="mr-2 flex items-center [&_svg]:size-4 [&_svg]:shrink-0">
                {option.icon}
              </span>
            )}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

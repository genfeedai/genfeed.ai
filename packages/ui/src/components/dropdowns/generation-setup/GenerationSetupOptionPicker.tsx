'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { GenerationSetupOptionPickerProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  fieldControlClassName,
  fieldControlTriggerClassName,
} from '@ui/primitives/field-control';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function GenerationSetupOptionPicker({
  label,
  onValueChange,
  options,
  value,
}: GenerationSetupOptionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const translate = useTranslations('agent.generationSetup');
  const selected = options.find((option) => option.value === value);
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={label}
          aria-expanded={isOpen}
          role="combobox"
          className={`${fieldControlClassName} ${fieldControlTriggerClassName} ${SHELL_CONTROL_HEIGHT_CLASS} w-full justify-between gap-2 font-normal`}
          size={ButtonSize.SM}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span className="truncate">
            {selected?.label ?? (value || label)}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        avoidCollisions={false}
        sideOffset={8}
        className="w-[min(240px,calc(100vw-2rem))] p-0"
      >
        <Command
          label={`Search ${label.toLowerCase()}`}
          filter={(option, search) =>
            option.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}…`}
          />
          <CommandList className="max-h-[min(256px,var(--radix-popover-content-available-height,50vh))]">
            <CommandEmpty>No matches</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.value}`}
                onSelect={() => {
                  onValueChange(option.value);
                  setIsOpen(false);
                }}
                className="gap-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.isPlatformDefault ? (
                  <span className="text-2xs text-muted-foreground">
                    {translate('platformDefault')}
                  </span>
                ) : null}
                {option.value === value ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

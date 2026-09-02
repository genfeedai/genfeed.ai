'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

export interface AgentOptionPickerItem<Value extends string = string> {
  description: string;
  icon?: ReactNode;
  label: string;
  meta: string;
  value: Value;
}

interface AgentOptionPickerProps<Value extends string = string> {
  label: string;
  onValueChange: (value: Value) => void;
  options: AgentOptionPickerItem<Value>[];
  value: Value;
}

export default function AgentOptionPicker<Value extends string = string>({
  label,
  onValueChange,
  options,
  value,
}: AgentOptionPickerProps<Value>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState('');
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  if (!selectedOption) {
    return null;
  }

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <Popover
        open={isOpen}
        onOpenChange={(nextOpen) => {
          setIsOpen(nextOpen);
          setHighlightedValue(nextOpen ? selectedOption.value : '');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ariaLabel={`${label}: ${selectedOption.label}`}
            className={cn(
              'flex min-h-16 w-full items-center gap-3 rounded-md bg-tertiary px-3 py-2 text-left shadow-border',
              'transition-shadow hover:shadow-border-strong focus-visible:shadow-border-strong',
            )}
            textTransform="none"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {selectedOption.icon ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground/70 shadow-border [&_svg]:size-4">
                {selectedOption.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-foreground">
                  {selectedOption.label}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {selectedOption.meta}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {selectedOption.description}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                isOpen && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverPanelContent
          align="start"
          className="max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-1.5"
          collisionPadding={16}
        >
          <Command
            className="flex max-h-full min-h-0 flex-col bg-transparent"
            label={label}
            onValueChange={setHighlightedValue}
            value={highlightedValue || selectedOption.value}
          >
            <CommandInput aria-label={label} placeholder={label} />
            <CommandList className="min-h-0 max-h-[min(26rem,calc(var(--radix-popover-content-available-height)-3.5rem))] flex-1 overflow-y-auto p-0">
              <CommandGroup
                aria-label={label}
                className="p-0 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-1 [&_[cmdk-group-items]]:gap-1 sm:[&_[cmdk-group-items]]:grid-cols-2"
              >
                {options.map((option) => {
                  const isSelected = option.value === selectedOption.value;

                  return (
                    <CommandItem
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'flex min-h-16 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-left',
                        'text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                        isSelected && 'bg-tertiary',
                      )}
                      key={option.value}
                      keywords={[option.label, option.description, option.meta]}
                      onSelect={() => {
                        onValueChange(option.value);
                        setIsOpen(false);
                        setHighlightedValue('');
                      }}
                      value={option.value}
                    >
                      {option.icon ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-tertiary text-foreground/70 shadow-border [&_svg]:size-4">
                          {option.icon}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                        <span className="mt-0.5 block text-2xs text-foreground/45">
                          {option.meta}
                        </span>
                      </span>
                      {isSelected ? (
                        <Check aria-hidden="true" className="size-4 shrink-0" />
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverPanelContent>
      </Popover>
    </fieldset>
  );
}

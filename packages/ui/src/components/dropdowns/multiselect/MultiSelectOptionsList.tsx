'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import * as formatHelper from '@genfeedai/helpers/formatting/format/format.helper';
import type { MultiSelectDropdownOption } from '@genfeedai/props/ui/forms/button.props';
import { Checkbox } from '@ui/primitives/checkbox';
import type { ReactNode } from 'react';

type MultiSelectOptionsListProps = {
  optionsForDisplay: readonly MultiSelectDropdownOption[];
  values: string[];
  shouldDisplayGroupHeaders: boolean;
  resolvedGroupLabels: Record<string, string>;
  handleToggle: (optionValue: string) => void;
};

export default function MultiSelectOptionsList({
  optionsForDisplay,
  values,
  shouldDisplayGroupHeaders,
  resolvedGroupLabels,
  handleToggle,
}: MultiSelectOptionsListProps): ReactNode {
  if (optionsForDisplay.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-foreground/60">
        No options available
      </div>
    );
  }

  const elements: ReactNode[] = [];
  let lastGroup: string | null = null;

  optionsForDisplay.forEach((option, index) => {
    const optionGroup = option.group ?? 'models';

    if (shouldDisplayGroupHeaders && optionGroup !== lastGroup) {
      const headerLabel =
        resolvedGroupLabels[optionGroup] ??
        formatHelper.capitalize(optionGroup ?? '');

      elements.push(
        <div
          key={`group-${optionGroup}`}
          className={`px-3 ${lastGroup ? 'pt-3' : 'pt-2'} pb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50`}
        >
          {headerLabel}
        </div>,
      );
    }

    lastGroup = optionGroup;

    elements.push(
      <div
        key={option.value || `option-${index}`}
        role="option"
        aria-selected={option.value ? values.includes(option.value) : false}
        aria-disabled={!option.value}
        onClick={(e) => {
          e.preventDefault();
          if (option.value) {
            handleToggle(option.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (option.value) {
              handleToggle(option.value);
            }
          }
        }}
        tabIndex={option.value ? 0 : -1}
        className={cn(
          'w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent transition-colors cursor-pointer',
          !option.value && 'opacity-50 cursor-not-allowed',
        )}
      >
        <span className="flex items-center justify-start gap-2">
          {option.value && (
            <div className="pointer-events-none">
              <Checkbox
                name={`option-${option.value}`}
                isChecked={values.includes(option.value)}
                onChange={() => {
                  // Row click/keyboard handles selection state.
                }}
                className="size-3.5 !border-white/20 data-[state=checked]:!bg-blue-500 data-[state=checked]:!border-blue-500 data-[state=checked]:!text-white"
              />
            </div>
          )}
          {option.icon && (
            <span className="flex items-center">{option.icon}</span>
          )}
          <span className="flex flex-col flex-1 min-w-0">
            <span className="text-sm">{option.label}</span>
            {option.description && (
              <span className="text-xs text-foreground/55 truncate">
                {option.description}
              </span>
            )}
          </span>
        </span>
      </div>,
    );
  });

  return elements;
}

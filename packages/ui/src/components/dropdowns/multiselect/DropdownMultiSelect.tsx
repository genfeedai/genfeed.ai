'use client';

import { ButtonSize, ButtonVariant, DropdownDirection } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MultiSelectDropdownProps } from '@genfeedai/props/ui/forms/button.props';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  type ChangeEvent,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiChevronDown } from 'react-icons/hi2';
import MultiSelectOptionsList from './MultiSelectOptionsList';
import MultiSelectSearchBar from './MultiSelectSearchBar';
import MultiSelectTabBar from './MultiSelectTabBar';

const EMPTY_ARRAY: never[] = [];

export default function MultiSelectDropdown({
  name,
  values = EMPTY_ARRAY,
  options,
  onChange,
  placeholder = 'Select…',
  className = '',
  icon,
  direction = DropdownDirection.DOWN,
  isDisabled = false,
  variant = ButtonVariant.GHOST,
  tabs,
  defaultTab,
  groupLabels,
  showGroupLabels = false,
  isSearchEnabled = false,
  searchPlaceholder = 'Search…',
  buttonRef: externalButtonRef,
  repositionTrigger: _repositionTrigger,
  shouldFlash = false,
}: MultiSelectDropdownProps & {
  buttonRef?: RefObject<HTMLButtonElement | null>;
  repositionTrigger?: string | number;
  shouldFlash?: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasTabs = Boolean(tabs?.length);
  const resolvedDefaultTab = useMemo(() => {
    if (!hasTabs) {
      return undefined;
    }
    if (defaultTab && tabs?.some((tab) => tab.id === defaultTab)) {
      return defaultTab;
    }
    return tabs?.[0]?.id;
  }, [hasTabs, tabs, defaultTab]);

  const [activeTab, setActiveTab] = useState<string | undefined>(
    resolvedDefaultTab,
  );

  const activeTabOrDefault = useMemo(() => {
    if (!hasTabs) {
      return undefined;
    }
    if (activeTab && tabs?.some((tab) => tab.id === activeTab)) {
      return activeTab;
    }
    return resolvedDefaultTab;
  }, [hasTabs, activeTab, resolvedDefaultTab, tabs]);

  const optionsForDisplay = useMemo(() => {
    let filtered = options;

    if (hasTabs && activeTabOrDefault && activeTabOrDefault !== 'all') {
      filtered = filtered.filter((option) => {
        const optionGroup = option.group ?? 'models';
        return optionGroup === activeTabOrDefault;
      });
    }

    if (isSearchEnabled && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((option) => {
        const labelMatch = option.label.toLowerCase().includes(searchLower);
        const descriptionMatch = option.description
          ? option.description.toLowerCase().includes(searchLower)
          : false;
        return labelMatch || descriptionMatch;
      });
    }

    return filtered;
  }, [hasTabs, activeTabOrDefault, options, isSearchEnabled, searchTerm]);

  const selectableOptions = useMemo(
    () => optionsForDisplay.filter((option) => Boolean(option.value)),
    [optionsForDisplay],
  );

  const allVisibleValues = useMemo(
    () => selectableOptions.map((option) => option.value),
    [selectableOptions],
  );

  const isAllVisibleSelected =
    allVisibleValues.length > 0 &&
    allVisibleValues.every((value) => values.includes(value));

  const resolvedGroupLabels = useMemo(() => {
    const labelMap: Record<string, string> = {};
    tabs?.forEach((tab) => {
      if (tab.id !== 'all') {
        labelMap[tab.id] = tab.label;
      }
    });
    if (groupLabels) {
      Object.assign(labelMap, groupLabels);
    }
    return labelMap;
  }, [tabs, groupLabels]);

  const shouldDisplayGroupHeaders = Boolean(
    hasTabs && showGroupLabels && activeTabOrDefault === 'all',
  );

  const selectedOptions = options.filter((opt) => values.includes(opt.value));

  const getDisplayLabel = (): string => {
    if (selectedOptions.length === 0) {
      return placeholder;
    }
    const firstLabel = selectedOptions[0].label;
    const truncated =
      firstLabel.length > 10 ? `${firstLabel.substring(0, 10)}…` : firstLabel;
    if (selectedOptions.length === 1) {
      return truncated;
    }
    return `${truncated} +${selectedOptions.length - 1}`;
  };

  const displayLabel = getDisplayLabel();

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleToggle = useCallback(
    (optionValue: string) => {
      if (isDisabled) {
        return;
      }
      const newValues = values.includes(optionValue)
        ? values.filter((v) => v !== optionValue)
        : [...values, optionValue];
      onChange(name, newValues);
    },
    [isDisabled, values, onChange, name],
  );

  const handleSelectAll = useCallback(() => {
    if (isDisabled || selectableOptions.length === 0) {
      return;
    }
    if (isAllVisibleSelected) {
      const remainingValues = values.filter(
        (value) => !allVisibleValues.includes(value),
      );
      return onChange(name, remainingValues);
    }
    const mergedValues = Array.from(new Set([...values, ...allVisibleValues]));
    onChange(name, mergedValues);
  }, [
    isDisabled,
    selectableOptions,
    isAllVisibleSelected,
    values,
    allVisibleValues,
    onChange,
    name,
  ]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setSearchTerm('');
        }
      }}
    >
      <DropdownMenuTrigger asChild disabled={isDisabled}>
        <PrimitiveButton
          ref={externalButtonRef}
          className={cn(
            buttonVariants({
              size: ButtonSize.SM,
              variant,
            }),
            values.length > 0 ? 'text-foreground' : 'text-foreground/70',
            isDisabled && 'opacity-50 cursor-not-allowed',
            shouldFlash &&
              'animate-pulse !border !border-white/50 !bg-white/10',
            className,
          )}
          aria-label={displayLabel}
        >
          {icon && <span className="flex items-center">{icon}</span>}
          <span className="text-xs font-medium">{displayLabel}</span>
          <HiChevronDown className="size-3 text-foreground/50 transition-transform" />
        </PrimitiveButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side={direction === 'up' ? 'top' : 'bottom'}
        className="min-w-40 max-w-64 max-h-64 overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {hasTabs && tabs && (
          <MultiSelectTabBar
            tabs={tabs}
            activeTabOrDefault={activeTabOrDefault}
            setActiveTab={setActiveTab}
          />
        )}

        {isSearchEnabled && (
          <MultiSelectSearchBar
            searchTerm={searchTerm}
            searchPlaceholder={searchPlaceholder}
            searchInputRef={searchInputRef}
            onSearchChange={handleSearchChange}
            onClear={() => setSearchTerm('')}
          />
        )}

        {selectableOptions.length > 1 && (
          <>
            <div
              role="option"
              aria-selected={isAllVisibleSelected}
              onClick={(e) => {
                e.preventDefault();
                handleSelectAll();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelectAll();
                }
              }}
              tabIndex={0}
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors cursor-pointer"
            >
              <span className="flex items-center justify-start gap-2">
                <div className="pointer-events-none">
                  <Checkbox
                    name="selectAll"
                    isChecked={isAllVisibleSelected}
                    onChange={() => {
                      // Row click/keyboard handles selection state.
                    }}
                    className="size-3.5 !border-white/20 data-[state=checked]:!bg-blue-500 data-[state=checked]:!border-blue-500 data-[state=checked]:!text-white"
                  />
                </div>
                All
              </span>
            </div>
            {optionsForDisplay.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        <MultiSelectOptionsList
          optionsForDisplay={optionsForDisplay}
          values={values}
          shouldDisplayGroupHeaders={shouldDisplayGroupHeaders}
          resolvedGroupLabels={resolvedGroupLabels}
          handleToggle={handleToggle}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

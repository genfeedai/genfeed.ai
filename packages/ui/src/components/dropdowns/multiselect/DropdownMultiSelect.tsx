'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  DropdownDirection,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import * as formatHelper from '@genfeedai/helpers/formatting/format/format.helper';
import type { MultiSelectDropdownProps } from '@genfeedai/props/ui/forms/button.props';
import {
  Button,
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HiChevronDown } from 'react-icons/hi2';

export default function MultiSelectDropdown({
  name,
  values = [],
  options,
  onChange,
  placeholder = 'Select...',
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
  searchPlaceholder = 'Search...',
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
      firstLabel.length > 10 ? `${firstLabel.substring(0, 10)}...` : firstLabel;
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

  const renderOptions = () => {
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
                  className="h-3.5 w-3.5 !border-white/20 data-[state=checked]:!bg-blue-500 data-[state=checked]:!border-blue-500 data-[state=checked]:!text-white"
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
  };

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
          <HiChevronDown className="h-3 w-3 text-foreground/50 transition-transform" />
        </PrimitiveButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side={direction === 'up' ? 'top' : 'bottom'}
        className="min-w-40 max-w-64 max-h-64 overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {hasTabs && tabs && (
          <>
            <div className="flex items-center gap-2 px-3 py-2">
              {tabs.map((tab) => {
                const isActive = activeTabOrDefault === tab.id;
                return (
                  <Button
                    key={tab.id}
                    withWrapper={false}
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.XS}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'rounded-full',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70',
                    )}
                  >
                    {tab.label}
                  </Button>
                );
              })}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {isSearchEnabled && (
          <div className="sticky top-0 bg-[#141414] z-10 px-2 py-1.5 border-b border-white/10">
            <FormSearchbar
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder={searchPlaceholder}
              inputRef={searchInputRef}
              onClick={(e) => e.stopPropagation()}
              onClear={() => setSearchTerm('')}
              size={ComponentSize.SM}
            />
          </div>
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
                    className="h-3.5 w-3.5 !border-white/20 data-[state=checked]:!bg-blue-500 data-[state=checked]:!border-blue-500 data-[state=checked]:!text-white"
                  />
                </div>
                All
              </span>
            </div>
            {optionsForDisplay.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {renderOptions()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

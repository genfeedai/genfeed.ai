'use client';

import { type ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/utils';
import DropdownOptionItem from './dropdown-field-option-item';
import DropdownSearchBar from './dropdown-field-search-bar';
import DropdownTabBar from './dropdown-field-tab-bar';
import DropdownTrigger from './dropdown-field-trigger';

const EMPTY_ARRAY: never[] = [];

export interface DropdownFieldOption {
  key: string | number;
  label: string;
  description?: string;
  thumbnailUrl?: string;
  badge?: string;
  badgeVariant?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'info'
    | 'success'
    | 'warning'
    | 'error';
  icon?: ReactNode;
  group?: string;
}

export interface DropdownFieldTab {
  id: string;
  label: string;
}

export interface DropdownFieldProps {
  name: string;
  value?: string | number;
  className?: string;
  placeholder?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  isFullWidth?: boolean;
  isSearchEnabled?: boolean;
  isNoneEnabled?: boolean;
  icon?: ReactNode;
  label?: string;
  triggerDisplay?: 'default' | 'icon-only';
  variant?: ButtonVariant;
  size?: ButtonSize;
  dropdownDirection?: 'up' | 'down' | 'left' | 'right';
  options: DropdownFieldOption[];
  tabs?: DropdownFieldTab[];
  defaultTab?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  onSearch?: (searchTerm: string) => void;
  preserveFocus?: boolean;
}

export function getBadgeVariant(
  variant: DropdownFieldOption['badgeVariant'],
):
  | 'default'
  | 'destructive'
  | 'info'
  | 'outline'
  | 'secondary'
  | 'success'
  | 'warning' {
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

export default function DropdownField({
  name,
  value,
  className = '',
  placeholder = 'Search…',
  isDisabled = false,
  isRequired = false,
  isFullWidth = true,
  isSearchEnabled = false,
  isNoneEnabled = false,
  icon,
  label,
  triggerDisplay = 'default',
  variant = ButtonVariant.GHOST,
  size,
  dropdownDirection = 'down',
  options = EMPTY_ARRAY,
  tabs,
  defaultTab = 'all',
  onChange = () => {},
  onSearch = () => {},
  preserveFocus = false,
}: DropdownFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(defaultTab);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const scheduleFocusRestore = useCallback(() => {
    if (!preserveFocus) {
      return;
    }

    const previouslyFocusedElement = previouslyFocusedElementRef.current;

    if (previouslyFocusedElement instanceof HTMLElement) {
      setTimeout(() => {
        previouslyFocusedElement.focus({ preventScroll: true });
      }, 0);
    }
  }, [preserveFocus]);

  const filteredItems = options.filter((option) => {
    if (!isSearchEnabled || !searchTerm) {
      return true;
    }

    const term = searchTerm.toLowerCase();
    const optionLabel = option.label?.toLowerCase();
    const description = option.description?.toLowerCase();
    return optionLabel?.includes(term) || description?.includes(term);
  });

  const filteredByTab =
    tabs && activeTab !== 'all'
      ? filteredItems.filter((option) => option.group === activeTab)
      : filteredItems;

  const selectedOption = options.find((option) => option.key === value);
  const selectedLabel = selectedOption?.label || label || name;
  const tooltipLabel = label || name;
  const ariaLabel =
    triggerDisplay === 'icon-only' ? tooltipLabel : selectedLabel;

  const handleClickOutside = useCallback((event: globalThis.MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
      setSearchTerm('');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);

      if (isSearchEnabled && !preserveFocus) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }

      document.querySelectorAll('details.dropdown').forEach((dropdown) => {
        if (dropdown.hasAttribute('open')) {
          dropdown.removeAttribute('open');
        }
      });
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside, isOpen, isSearchEnabled, preserveFocus]);

  useEffect(() => {
    if (isSearchEnabled && onSearch) {
      const timer = setTimeout(() => {
        onSearch(searchTerm);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isSearchEnabled, onSearch, searchTerm]);

  const handleSelect = (nextValue: string | number) => {
    const syntheticEvent = {
      currentTarget: {
        name,
        value: nextValue,
      },
      target: {
        name,
        value: nextValue,
      },
    } as ChangeEvent<HTMLSelectElement>;

    onChange(syntheticEvent);
    setIsOpen(false);
    setSearchTerm('');
    scheduleFocusRestore();
  };

  const handleTriggerMouseDown = () => {
    if (!preserveFocus || isDisabled || isOpen) {
      return;
    }

    const activeElement = document.activeElement;
    previouslyFocusedElementRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
  };

  const handleToggle = () => {
    if (isDisabled) {
      return;
    }

    if (!isOpen && preserveFocus && !previouslyFocusedElementRef.current) {
      const activeElement = document.activeElement;
      previouslyFocusedElementRef.current =
        activeElement instanceof HTMLElement ? activeElement : null;
    }

    setIsOpen((previousValue) => {
      const nextValue = !previousValue;
      if (!nextValue) {
        setSearchTerm('');
      }
      scheduleFocusRestore();
      return nextValue;
    });
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const widthClass = isFullWidth ? 'w-full' : 'w-auto';

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-2 ${widthClass} ${
        isFullWidth ? '' : 'flex-shrink-0'
      }`}
    >
      <DropdownTrigger
        name={name}
        icon={icon}
        label={label}
        triggerDisplay={triggerDisplay}
        variant={variant}
        size={size}
        isRequired={isRequired}
        isDisabled={isDisabled}
        isFullWidth={isFullWidth}
        isOpen={isOpen}
        className={className}
        selectedOption={selectedOption}
        selectedLabel={selectedLabel}
        tooltipLabel={tooltipLabel}
        ariaLabel={ariaLabel}
        onToggle={handleToggle}
        onMouseDown={handleTriggerMouseDown}
      />

      {isOpen && !isDisabled && (
        <div
          ref={dropdownRef}
          className={cn(
            'absolute z-50',
            dropdownDirection === 'left' && 'right-0',
            dropdownDirection === 'right' && 'left-0',
            (dropdownDirection === 'up' || dropdownDirection === 'down') &&
              'left-0',
            dropdownDirection === 'up' && 'bottom-full mb-2',
            dropdownDirection === 'down' && 'top-full mt-2',
            dropdownDirection === 'left' && 'top-full mt-2',
            dropdownDirection === 'right' && 'top-full mt-2',
            'menu rounded-md border border-border bg-popover text-popover-foreground shadow-md',
            'w-80 max-h-[60vh] overflow-hidden p-2',
          )}
        >
          <div className="overflow-y-auto max-h-[calc(60vh-3rem)] space-y-1">
            <DropdownSearchBar
              isSearchEnabled={isSearchEnabled}
              searchTerm={searchTerm}
              placeholder={placeholder}
              searchInputRef={searchInputRef}
              onSearchChange={handleSearchChange}
              onClear={() => setSearchTerm('')}
            />

            {tabs && tabs.length > 0 && (
              <DropdownTabBar
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            )}

            {isNoneEnabled && (
              <button
                type="button"
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-background transition-colors',
                  !value && 'bg-primary/20',
                )}
                onClick={() => handleSelect('')}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect('');
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">None</div>
                </div>

                <div className="mt-0.5 text-xs text-foreground/60">
                  Clear selection
                </div>
              </button>
            )}

            {filteredByTab.map((option, index) => (
              <DropdownOptionItem
                key={
                  option.key != null ? String(option.key) : `option-${index}`
                }
                option={option}
                value={value}
                index={index}
                getBadgeVariant={getBadgeVariant}
                onSelect={handleSelect}
              />
            ))}

            {filteredItems.length === 0 && searchTerm && (
              <div className="py-4 text-center text-sm text-foreground/40">
                No results found for &quot;{searchTerm}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

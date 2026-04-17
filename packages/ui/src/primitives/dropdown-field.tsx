'use client';

import { type ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { X } from 'lucide-react';
import Image from 'next/image';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';
import { SimpleTooltip } from './tooltip';

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

function getBadgeVariant(
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
  placeholder = 'Search...',
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
  options = [],
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
              variant={getBadgeVariant(selectedOption.badgeVariant)}
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

  const widthClass = isFullWidth ? 'w-full' : 'w-auto';
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

  const triggerButton = (
    <Button
      variant={variant}
      size={size}
      aria-required={isRequired || undefined}
      className={buttonClassName}
      wrapperClassName={cn(wrapperClass)}
      onClick={handleToggle}
      onMouseDown={handleTriggerMouseDown}
      isDisabled={isDisabled}
      aria-expanded={isOpen}
      ariaLabel={ariaLabel}
      label={getDisplayLabel()}
      withWrapper={icon && label ? false : undefined}
    />
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-2 ${widthClass} ${
        isFullWidth ? '' : 'flex-shrink-0'
      }`}
    >
      {icon && label ? (
        <SimpleTooltip
          label={tooltipLabel}
          position="top"
          isDisabled={isDisabled}
        >
          <div className={cn('capitalize', wrapperClass)}>{triggerButton}</div>
        </SimpleTooltip>
      ) : (
        triggerButton
      )}

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
            {isSearchEnabled && (
              <div className="sticky top-0 z-10 bg-popover pb-2">
                <div className="relative p-1">
                  <Input
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder={placeholder}
                    inputRef={searchInputRef}
                    onClick={(event: ReactMouseEvent<HTMLInputElement>) =>
                      event.stopPropagation()
                    }
                    className="pr-8"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 transition-colors hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSearchTerm('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {tabs && tabs.length > 0 && (
              <div className="mb-2 flex items-center gap-2 border-b border-border px-3 pb-2">
                {tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveTab(tab.id);
                    }}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      activeTab === tab.id
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
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
              <button
                type="button"
                key={
                  option.key != null ? String(option.key) : `option-${index}`
                }
                className={cn(
                  'w-full px-3 py-2 text-left hover:bg-background transition-colors',
                  value === option.key && 'bg-primary/20',
                )}
                onClick={() => handleSelect(option.key)}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelect(option.key);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {option.thumbnailUrl && (
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden bg-muted">
                        <Image
                          src={option.thumbnailUrl}
                          alt={option.label}
                          className="h-full w-full object-cover"
                          width={40}
                          height={40}
                          sizes="40px"
                          priority={true}
                        />
                      </div>
                    )}

                    {option.icon && !option.thumbnailUrl && (
                      <div className="flex-shrink-0 text-foreground/70">
                        {option.icon}
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="line-clamp-2 break-all text-sm font-medium">
                        {option.label}
                      </div>

                      {option.description && (
                        <div className="line-clamp-2 break-all text-xs text-foreground/60">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {option.badge && (
                    <Badge
                      variant={getBadgeVariant(option.badgeVariant)}
                      className="flex-shrink-0"
                    >
                      {option.badge}
                    </Badge>
                  )}
                </div>
              </button>
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

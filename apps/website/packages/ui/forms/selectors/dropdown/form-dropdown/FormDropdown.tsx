'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  FormDropdownOption,
  FormDropdownProps,
} from '@props/forms/form.props';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Image from 'next/image';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export default function FormDropdown({
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
}: FormDropdownProps) {
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

  const filteredItems = options.filter((option: FormDropdownOption) => {
    if (!isSearchEnabled || !searchTerm) {
      return true;
    }
    const label = option.label?.toLowerCase();
    const description = option.description?.toLowerCase();
    const term = searchTerm.toLowerCase();
    return label?.includes(term) || description?.includes(term);
  });

  // Filter by active tab (only for options mode)
  const filteredByTab =
    tabs && activeTab !== 'all'
      ? filteredItems.filter((option) => option.group === activeTab)
      : filteredItems;

  const selectedOption = options.find(
    (opt: FormDropdownOption) => opt.key === value,
  );
  const selectedLabel = selectedOption?.label || label || name;
  const tooltipLabel = label || name;
  const ariaLabel =
    triggerDisplay === 'icon-only' ? tooltipLabel : selectedLabel;

  const handleClickOutside = useCallback((event: MouseEvent) => {
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
      // Focus search input when dropdown opens unless we need to preserve external focus
      if (isSearchEnabled && !preserveFocus) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }

      // Close other dropdowns
      document.querySelectorAll('details.dropdown').forEach((dropdown) => {
        if (dropdown.hasAttribute('open')) {
          dropdown.removeAttribute('open');
        }
      });
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isSearchEnabled, preserveFocus, handleClickOutside]);

  // Debounce search
  useEffect(() => {
    if (isSearchEnabled && onSearch) {
      const timer = setTimeout(() => {
        onSearch(searchTerm);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, onSearch, isSearchEnabled]);

  const handleSelect = (val: string | number) => {
    // Create a synthetic event object that matches ChangeEvent interface
    // This is needed because we're programmatically triggering onChange
    // without a real DOM event from a select element
    const syntheticEvent = {
      currentTarget: {
        name,
        value: val,
      },
      target: {
        name,
        value: val,
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

    setIsOpen((prev) => {
      const next = !prev;
      if (!next) {
        // Clear search term when closing
        setSearchTerm('');
      }
      scheduleFocusRestore();
      return next;
    });
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const getDisplayLabel = () => {
    if (triggerDisplay === 'icon-only' && icon) {
      return <span className="flex items-center">{icon}</span>;
    }

    if (icon) {
      return (
        <span className="flex items-center gap-2 w-full justify-between">
          <span className="flex items-center gap-2 flex-shrink-1 min-w-0">
            <span className="flex-shrink-0">{icon}</span>
            <span className="hidden sm:inline truncate">{selectedLabel}</span>
          </span>
          {selectedOption?.badge && (
            <Badge
              size={ComponentSize.SM}
              variant={selectedOption.badgeVariant || 'primary'}
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
            // Horizontal positioning
            dropdownDirection === 'left' && 'right-0',
            dropdownDirection === 'right' && 'left-0',
            (dropdownDirection === 'up' || dropdownDirection === 'down') &&
              'left-0',
            // Vertical positioning
            dropdownDirection === 'up' && 'bottom-full mb-2',
            dropdownDirection === 'down' && 'top-full mt-2',
            dropdownDirection === 'left' && 'top-full mt-2',
            dropdownDirection === 'right' && 'top-full mt-2',
            'menu rounded-lg shadow-2xl bg-[#141414] border border-white/[0.08]',
            'w-80 max-h-[60vh] overflow-hidden p-2',
          )}
        >
          <div className="overflow-y-auto max-h-[calc(60vh-3rem)] space-y-1">
            {/* Search Bar */}
            {isSearchEnabled && (
              <div className="sticky top-0 bg-[#141414] pb-2 z-10">
                <div className="p-1">
                  <FormSearchbar
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder={placeholder}
                    inputRef={searchInputRef}
                    onClick={(e) => e.stopPropagation()}
                    onClear={() => setSearchTerm('')}
                  />
                </div>
              </div>
            )}

            {/* Tabs */}
            {tabs && tabs.length > 0 && (
              <div className="flex items-center gap-2 px-3 pb-2 border-b border-white/[0.08] mb-2">
                {tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab(tab.id);
                    }}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground/70 hover:bg-background',
                    )}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
            )}

            {/* None option */}
            {isNoneEnabled && (
              <div
                className={cn(
                  'px-3 py-2 hover:bg-background cursor-pointer transition-colors',
                  !value && 'bg-primary/20',
                )}
                onClick={() => handleSelect('')}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">None</div>
                </div>

                <div className="text-xs text-foreground/60 mt-0.5">
                  Clear selection
                </div>
              </div>
            )}

            {/* Options */}
            {filteredByTab.map((option, index) => (
              <div
                key={
                  option.key != null ? String(option.key) : `option-${index}`
                }
                className={cn(
                  'px-3 py-2 hover:bg-background cursor-pointer transition-colors',
                  value === option.key && 'bg-primary/20',
                )}
                onClick={() => handleSelect(option.key)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {option.thumbnailUrl && (
                      <div className="flex-shrink-0 w-10 h-10 overflow-hidden bg-muted">
                        <Image
                          src={option.thumbnailUrl}
                          alt={option.label}
                          className="w-full h-full object-cover"
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

                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <div className="font-medium text-sm break-all line-clamp-2">
                        {option.label}
                      </div>

                      {option.description && (
                        <div className="text-xs text-foreground/60 line-clamp-2 break-all">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {option.badge && (
                    <Badge
                      size={ComponentSize.SM}
                      variant={option.badgeVariant || 'primary'}
                      className="flex-shrink-0"
                    >
                      {option.badge}
                    </Badge>
                  )}
                </div>
              </div>
            ))}

            {/* No results */}
            {filteredItems.length === 0 && searchTerm && (
              <div className="text-center py-4 text-foreground/40 text-sm">
                No results found for &quot;{searchTerm}&quot;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

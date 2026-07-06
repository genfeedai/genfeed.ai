'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IFilters } from '@genfeedai/interfaces/utils/filters.interface';
import type { FiltersBarProps } from '@genfeedai/props/ui/forms/filters.props';
import { Button } from '@ui/primitives/button';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineFunnel } from 'react-icons/hi2';
import FiltersPanel from './FiltersPanel';
import {
  DEFAULT_ACCOUNT_OPTIONS,
  DEFAULT_FAVORITE_OPTIONS,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_FORMAT_OPTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_PROVIDER_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_TYPE_OPTIONS,
  DEFAULT_VISIBLE_FILTERS,
} from './filters-button-options.constants';

export default function FiltersButton({
  filters,
  onFiltersChange,
  className = '',
  filterOptions = DEFAULT_FILTER_OPTIONS,
  visibleFilters = DEFAULT_VISIBLE_FILTERS,
}: FiltersBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search ?? '');
  const isInternalUpdateRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null); // portal content
  const triggerRef = useRef<HTMLDivElement>(null);
  const [portalCoords, setPortalCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const insideDropdown = dropdownRef.current?.contains(target);
      const insideTrigger = triggerRef.current?.contains(target);

      // Check if click is inside a Radix portaled dropdown (ButtonDropdown or DropdownMultiSelect)
      const insideChildDropdown = !!target.closest(
        '[data-radix-popper-content-wrapper]',
      );

      if (!insideDropdown && !insideTrigger && !insideChildDropdown) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Position portal relative to trigger (align to right of trigger, open left)
  useEffect(() => {
    const updatePosition = () => {
      if (!isOpen || !triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const desiredWidth = Math.min(640, Math.max(400, window.innerWidth - 24));
      const left = Math.max(12, rect.right - desiredWidth);
      const top = rect.bottom + 8;
      setPortalCoords({ left, top, width: desiredWidth });
    };

    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  // Notify parent of filter changes
  const notifyFilterChange = useCallback(
    (newFilters: typeof filters) => {
      const query: IFilters = {};
      Object.entries(newFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query[key as keyof IFilters] = value;
        }
      });
      onFiltersChange?.(newFilters, query);
    },
    [onFiltersChange],
  );

  // Sync internal search value with external filters prop
  // Only update if the change came from external source (not from internal debounced update)
  useEffect(() => {
    if (!isInternalUpdateRef.current && filters.search !== searchValue) {
      requestAnimationFrame(() => {
        setSearchValue(filters.search ?? '');
      });
    }
    isInternalUpdateRef.current = false;
  }, [filters.search, searchValue]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        isInternalUpdateRef.current = true;
        notifyFilterChange({ ...filters, search: searchValue });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, filters, notifyFilterChange]);

  const updateFiltersButton = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === 'search') {
      setSearchValue(value);
    } else {
      notifyFilterChange({ ...filters, [name]: value });
    }
  };

  const handleDropdownChange = (name: string, value: string | string[]) => {
    notifyFilterChange({ ...filters, [name]: value });
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      brand: '',
      category: '',
      favorite: '',
      format: '',
      model: '',
      provider: '',
      search: '',
      sort: '',
      status: [] as string[],
      type: '',
    };

    setSearchValue('');
    notifyFilterChange(clearedFilters);
  };

  const hasActiveFilters =
    (Array.isArray(filters.status)
      ? filters.status.length > 0
      : filters.status) ||
    filters.search ||
    filters.format ||
    filters.type ||
    filters.provider ||
    filters.model ||
    filters.sort ||
    filters.favorite ||
    filters.brand ||
    filters.category;

  // Use custom options if provided, otherwise use defaults
  const STATUS_OPTIONS = filterOptions.status || DEFAULT_STATUS_OPTIONS;
  const FORMAT_OPTIONS = filterOptions.format || DEFAULT_FORMAT_OPTIONS;
  const TYPE_OPTIONS = filterOptions.type || DEFAULT_TYPE_OPTIONS;
  const PROVIDER_OPTIONS = filterOptions.provider || DEFAULT_PROVIDER_OPTIONS;
  const MODEL_OPTIONS = filterOptions.model || DEFAULT_MODEL_OPTIONS;
  const SORT_OPTIONS = filterOptions.sort || DEFAULT_SORT_OPTIONS;
  const FAVORITE_OPTIONS = filterOptions.favorite || DEFAULT_FAVORITE_OPTIONS;
  const ACCOUNT_OPTIONS = filterOptions.brand || DEFAULT_ACCOUNT_OPTIONS;
  const CATEGORY_OPTIONS = filterOptions.category || [];

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      {/* Filter Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant={ButtonVariant.GHOST}
        icon={<HiOutlineFunnel className="size-4" />}
        tooltip="Filters"
      />

      {/* Dropdown Panel (portal to body to avoid clipping/overflow) */}
      {isOpen &&
        portalCoords &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-secondary border border-white/[0.06] shadow-2xl z-[10000] p-6 pointer-events-auto"
            style={{
              left: portalCoords.left,
              top: portalCoords.top,
              width: portalCoords.width,
            }}
          >
            <FiltersPanel
              filters={filters}
              searchValue={searchValue}
              hasActiveFilters={!!hasActiveFilters}
              visibleFilters={visibleFilters}
              statusOptions={STATUS_OPTIONS}
              formatOptions={FORMAT_OPTIONS}
              typeOptions={TYPE_OPTIONS}
              providerOptions={PROVIDER_OPTIONS}
              modelOptions={MODEL_OPTIONS}
              sortOptions={SORT_OPTIONS}
              favoriteOptions={FAVORITE_OPTIONS}
              accountOptions={ACCOUNT_OPTIONS}
              categoryOptions={CATEGORY_OPTIONS}
              onSearchChange={updateFiltersButton}
              onDropdownChange={handleDropdownChange}
              onClearFilters={handleClearFilters}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
